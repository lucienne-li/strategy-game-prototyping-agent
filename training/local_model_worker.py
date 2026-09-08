from __future__ import annotations

import argparse
import json
import re
import sys

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


def main() -> None:
    parser = argparse.ArgumentParser(description="Persistent JSONL worker for local Base/SFT code generation.")
    parser.add_argument("--model", default="Qwen/Qwen2.5-Coder-0.5B-Instruct")
    parser.add_argument("--adapter")
    parser.add_argument("--max-new-tokens", type=int, default=512)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    args = parser.parse_args()

    torch.set_num_threads(min(8, torch.get_num_threads()))
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    device = "cuda" if args.device == "auto" and torch.cuda.is_available() else args.device
    if device == "auto":
        device = "cpu"
    dtype = torch.bfloat16 if device == "cuda" and torch.cuda.is_bf16_supported() else torch.float32
    model = AutoModelForCausalLM.from_pretrained(args.model, dtype=dtype).to(device)
    if args.adapter:
        model = PeftModel.from_pretrained(model, args.adapter)
    model.eval()
    model.generation_config.temperature = None
    model.generation_config.top_p = None
    model.generation_config.top_k = None

    for line in sys.stdin:
        try:
            request = json.loads(line)
            prompt = build_prompt(request)
            text = tokenizer.apply_chat_template(
                [{"role": "user", "content": prompt}], tokenize=False, add_generation_prompt=True, enable_thinking=False
            )
            inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=1536).to(device)
            with torch.inference_mode():
                output = model.generate(
                    **inputs,
                    max_new_tokens=args.max_new_tokens,
                    do_sample=False,
                    pad_token_id=tokenizer.eos_token_id,
                )
            raw = tokenizer.decode(output[0][inputs["input_ids"].shape[1] :], skip_special_tokens=True).strip()
            code = extract_code(raw)
            response = {"id": request["id"], "ok": bool(code), "code": code, "raw": raw}
        except Exception as error:
            response = {"id": request.get("id") if isinstance(request, dict) else None, "ok": False, "error": str(error)}
        print(json.dumps(response, ensure_ascii=False), flush=True)


def build_prompt(request: dict) -> str:
    existing = request.get("existing_code")
    existing_section = (
        f"\nExisting {request['target_file']} that must be replaced with the corrected complete file:\n"
        f"```typescript\n{existing}\n```\n"
        if existing is not None
        else ""
    )
    return f"""Create the complete contents of `{request['target_file']}` for this coding task.
Return only TypeScript source code, without Markdown fences or explanation.
The file will run directly under Node.js 24 with type stripping. Do not import third-party packages.
Do not include tests unless the request explicitly asks for them.

Task:
{request['request']}
{existing_section}"""


def extract_code(raw: str) -> str:
    fenced = re.search(r"```(?:typescript|ts|javascript|js)?\s*\n(.*?)```", raw, flags=re.DOTALL | re.IGNORECASE)
    code = fenced.group(1) if fenced else raw
    code = code.strip()
    if code.startswith("Here is") and "\n" in code:
        code = code.split("\n", 1)[1].strip()
    return code + "\n" if code else ""


if __name__ == "__main__":
    main()
