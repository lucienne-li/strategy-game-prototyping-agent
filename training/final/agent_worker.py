from __future__ import annotations

import argparse
import json
import re
import sys

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="Qwen/Qwen3-4B"); parser.add_argument("--adapter")
    parser.add_argument("--max-new-tokens", type=int, default=4096)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("final benchmark worker requires CUDA")
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=dtype, bnb_4bit_use_double_quant=True)
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForCausalLM.from_pretrained(args.model, quantization_config=quant, dtype=dtype, device_map="auto")
    if args.adapter:
        model = PeftModel.from_pretrained(model, args.adapter)
    model.eval()
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line); prompt = build_prompt(request)
            text = tokenizer.apply_chat_template([{"role": "user", "content": prompt}], tokenize=False, add_generation_prompt=True, enable_thinking=False)
            inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=8192).to(next(model.parameters()).device)
            with torch.inference_mode():
                output = model.generate(**inputs, max_new_tokens=args.max_new_tokens, do_sample=False, pad_token_id=tokenizer.eos_token_id)
            raw = tokenizer.decode(output[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()
            artifact = parse_artifact(raw)
            result = {"id": request["id"], "ok": True, "artifact": artifact, "raw": raw}
        except Exception as error:
            result = {"id": request.get("id"), "ok": False, "error": str(error)}
        print(json.dumps(result, ensure_ascii=False), flush=True)


def build_prompt(request: dict) -> str:
    existing = request.get("existing_files", [])
    existing_text = "\n".join(f"Existing `{item['path']}`:\n```typescript\n{item['content']}\n```" for item in existing)
    return f"""Complete the coding task as an artifact JSON object with exactly this shape:
{{"files":[{{"path":"relative/path.ts","content":"complete file contents"}}]}}
Return only JSON. Use relative workspace paths. Include every source file needed by the task and no evaluator/tests/internal files.

Task:
{request['request']}

{existing_text}"""


def parse_artifact(raw: str) -> dict:
    fenced = re.search(r"```(?:json)?\s*(.*?)```", raw, re.DOTALL | re.IGNORECASE)
    value = json.loads((fenced.group(1) if fenced else raw).strip())
    files = value.get("files") if isinstance(value, dict) else None
    if not isinstance(files, list) or not 1 <= len(files) <= 8:
        raise ValueError("artifact must contain 1-8 files")
    for item in files:
        if not isinstance(item, dict) or not isinstance(item.get("path"), str) or not isinstance(item.get("content"), str):
            raise ValueError("invalid artifact file")
    return {"files": files}


if __name__ == "__main__":
    main()
