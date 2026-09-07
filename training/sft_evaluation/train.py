from __future__ import annotations

import argparse
import gc
import json
import os
import random
import time
from pathlib import Path

import torch
from peft import LoraConfig, PeftModel, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer

from training.sft_smoke.data import encode_response_only, load_chat_samples


DEFAULT_MODEL = "Qwen/Qwen2.5-Coder-0.5B-Instruct"


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the small v2 dataset with response-only CPU LoRA.")
    parser.add_argument("--data", default="data_pipeline/samples/accepted-v2.jsonl")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--output", default="artifacts/sft-evaluation")
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.epochs < 1 or args.epochs > 5:
        raise ValueError("epochs must be between 1 and 5")

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.set_num_threads(min(8, os.cpu_count() or 1))
    output_dir = Path(args.output).resolve()
    checkpoint_dir = output_dir / "checkpoint-final"
    output_dir.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()

    samples = load_chat_samples(args.data)
    raw_records = [json.loads(line) for line in Path(args.data).read_text(encoding="utf-8").splitlines() if line.strip()]
    repository_families = {record["metadata"]["repository_family_id"] for record in raw_records}
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    encoded = [encode_response_only(sample, tokenizer, args.max_length) for sample in samples]

    model = AutoModelForCausalLM.from_pretrained(args.model, dtype=torch.float32)
    model.config.use_cache = False
    model = get_peft_model(
        model,
        LoraConfig(
            task_type="CAUSAL_LM",
            r=4,
            lora_alpha=8,
            lora_dropout=0.0,
            target_modules=["q_proj", "v_proj"],
        ),
    )
    trainable_parameters = sum(parameter.numel() for parameter in model.parameters() if parameter.requires_grad)
    optimizer = torch.optim.AdamW(
        (parameter for parameter in model.parameters() if parameter.requires_grad),
        lr=args.learning_rate,
    )

    model.train()
    step_losses: list[float] = []
    epoch_losses: list[float] = []
    training_started = time.perf_counter()
    order = list(range(len(encoded)))
    for epoch in range(args.epochs):
        random.Random(args.seed + epoch).shuffle(order)
        current_losses = []
        for index in order:
            item = encoded[index]
            batch = {key: torch.tensor([value], dtype=torch.long) for key, value in item.items()}
            optimizer.zero_grad(set_to_none=True)
            loss = model(**batch).loss
            if loss is None or not torch.isfinite(loss):
                raise RuntimeError(f"non-finite loss at epoch {epoch + 1}, sample {samples[index].sample_id}")
            loss.backward()
            optimizer.step()
            value = float(loss.detach())
            step_losses.append(value)
            current_losses.append(value)
        epoch_losses.append(sum(current_losses) / len(current_losses))
        print(json.dumps({"epoch": epoch + 1, "mean_loss": epoch_losses[-1]}), flush=True)

    training_seconds = time.perf_counter() - training_started
    model.save_pretrained(checkpoint_dir)
    tokenizer.save_pretrained(checkpoint_dir)
    del optimizer, model
    gc.collect()

    reload_started = time.perf_counter()
    base = AutoModelForCausalLM.from_pretrained(args.model, dtype=torch.float32)
    reloaded = PeftModel.from_pretrained(base, checkpoint_dir)
    reloaded.eval()
    reloaded.generation_config.temperature = None
    reloaded.generation_config.top_p = None
    reloaded.generation_config.top_k = None
    prompt = tokenizer.apply_chat_template(
        [{"role": "user", "content": "Implement a TypeScript function that spends one energy and deals six damage."}],
        tokenize=False,
        add_generation_prompt=True,
    )
    prompt_batch = tokenizer(prompt, return_tensors="pt")
    with torch.inference_mode():
        generated = reloaded.generate(**prompt_batch, max_new_tokens=24, do_sample=False, pad_token_id=tokenizer.eos_token_id)
    generated_text = tokenizer.decode(generated[0][prompt_batch["input_ids"].shape[1] :], skip_special_tokens=True)
    reload_seconds = time.perf_counter() - reload_started

    report = {
        "status": "passed",
        "purpose": "small_scale_effect_evaluation_training",
        "base_model": args.model,
        "device": "cpu",
        "torch_version": torch.__version__,
        "samples": len(samples),
        "repository_families": len(repository_families),
        "epochs": args.epochs,
        "steps": len(step_losses),
        "max_length": args.max_length,
        "learning_rate": args.learning_rate,
        "seed": args.seed,
        "assistant_response_only_masking": True,
        "lora": {"r": 4, "alpha": 8, "dropout": 0.0, "target_modules": ["q_proj", "v_proj"]},
        "trainable_parameters": trainable_parameters,
        "epoch_mean_losses": epoch_losses,
        "first_step_loss": step_losses[0],
        "last_step_loss": step_losses[-1],
        "training_seconds": training_seconds,
        "total_seconds": time.perf_counter() - started,
        "checkpoint_path": str(checkpoint_dir),
        "checkpoint_reload_succeeded": True,
        "reload_and_generation_seconds": reload_seconds,
        "generation_succeeded": bool(generated_text.strip()),
        "generated_text": generated_text,
    }
    (output_dir / "train-run.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
