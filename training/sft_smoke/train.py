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

from training.sft_smoke.data import load_chat_samples, render_chat_samples


DEFAULT_MODEL = "Qwen/Qwen2.5-Coder-0.5B-Instruct"


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a deliberately tiny CPU LoRA SFT smoke test.")
    parser.add_argument("--data", default="data_pipeline/samples/accepted.jsonl")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--output", default="artifacts/sft-smoke")
    parser.add_argument("--steps", type=int, default=3)
    parser.add_argument("--max-length", type=int, default=256)
    parser.add_argument("--learning-rate", type=float, default=5e-4)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if args.steps < 1 or args.steps > 20:
        raise ValueError("steps must be between 1 and 20 for the smoke test")
    if args.max_length < 32 or args.max_length > 1024:
        raise ValueError("max-length must be between 32 and 1024")

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.set_num_threads(min(8, os.cpu_count() or 1))

    started = time.perf_counter()
    output_dir = Path(args.output).resolve()
    checkpoint_dir = output_dir / "checkpoint-final"
    output_dir.mkdir(parents=True, exist_ok=True)

    samples = load_chat_samples(args.data)
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    rendered = render_chat_samples(samples, tokenizer)

    # Repeating the shortest record intentionally makes an optimization signal
    # observable in only a few CPU steps. All records are still loaded and
    # template-validated; this is not an effectiveness experiment.
    optimized = min(rendered, key=lambda item: len(tokenizer(item["text"])["input_ids"]))
    batch = tokenizer(
        optimized["text"],
        return_tensors="pt",
        truncation=True,
        max_length=args.max_length,
    )
    batch["labels"] = batch["input_ids"].clone()

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
    losses: list[float] = []
    step_durations: list[float] = []
    for _ in range(args.steps):
        step_started = time.perf_counter()
        optimizer.zero_grad(set_to_none=True)
        loss = model(**batch).loss
        if loss is None or not torch.isfinite(loss):
            raise RuntimeError(f"non-finite training loss: {loss}")
        loss.backward()
        optimizer.step()
        losses.append(float(loss.detach()))
        step_durations.append(time.perf_counter() - step_started)

    model.save_pretrained(checkpoint_dir)
    tokenizer.save_pretrained(checkpoint_dir)

    del optimizer, model
    gc.collect()

    reload_started = time.perf_counter()
    reloaded_base = AutoModelForCausalLM.from_pretrained(args.model, dtype=torch.float32)
    reloaded = PeftModel.from_pretrained(reloaded_base, checkpoint_dir)
    reloaded.eval()
    reloaded.generation_config.temperature = None
    reloaded.generation_config.top_p = None
    reloaded.generation_config.top_k = None
    prompt_messages = [{"role": "user", "content": "Write a TypeScript function named add that returns the sum of two numbers."}]
    prompt = tokenizer.apply_chat_template(prompt_messages, tokenize=False, add_generation_prompt=True)
    prompt_batch = tokenizer(prompt, return_tensors="pt")
    with torch.inference_mode():
        generated = reloaded.generate(
            **prompt_batch,
            max_new_tokens=12,
            do_sample=False,
            pad_token_id=tokenizer.eos_token_id,
        )
    generated_text = tokenizer.decode(generated[0][prompt_batch["input_ids"].shape[1] :], skip_special_tokens=True)
    reload_seconds = time.perf_counter() - reload_started

    report = {
        "status": "passed",
        "purpose": "technical_chain_smoke_test_only",
        "base_model": args.model,
        "device": "cpu",
        "torch_version": torch.__version__,
        "loaded_samples": len(samples),
        "optimized_sample_id": optimized["sample_id"],
        "optimization_steps": args.steps,
        "max_length": args.max_length,
        "learning_rate": args.learning_rate,
        "seed": args.seed,
        "lora": {"r": 4, "alpha": 8, "dropout": 0.0, "target_modules": ["q_proj", "v_proj"]},
        "trainable_parameters": trainable_parameters,
        "losses": losses,
        "loss_decreased": losses[-1] < losses[0],
        "step_durations_seconds": step_durations,
        "training_seconds": sum(step_durations),
        "total_seconds": time.perf_counter() - started,
        "checkpoint_path": str(checkpoint_dir),
        "checkpoint_reload_succeeded": True,
        "reload_and_generation_seconds": reload_seconds,
        "generation_succeeded": bool(generated_text.strip()),
        "generated_text": generated_text,
    }
    (output_dir / "run.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
