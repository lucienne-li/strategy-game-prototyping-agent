from __future__ import annotations

import argparse
import gc
import hashlib
import json
import random
import time
from pathlib import Path

import torch
from peft import LoraConfig, PeftModel, get_peft_model, prepare_model_for_kbit_training
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

from training.sft_smoke.data import encode_response_only, load_chat_samples


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Qwen3-4B on the accepted scale-up dataset with LoRA or QLoRA.")
    parser.add_argument("--data", default="data_pipeline/scale/accepted.jsonl")
    parser.add_argument("--model", default="Qwen/Qwen3-4B")
    parser.add_argument("--output", default="artifacts/sft-scale")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--max-length", type=int, default=1024)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--gradient-accumulation", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--qlora", action="store_true")
    parser.add_argument("--allow-cpu", action="store_true")
    parser.add_argument("--freeze", default="data_pipeline/scale/freeze-manifest.json")
    args = parser.parse_args()
    freeze = json.loads(Path(args.freeze).read_text(encoding="utf-8"))
    verify_freeze(args, freeze)
    if not torch.cuda.is_available() and not args.allow_cpu:
        raise RuntimeError("Qwen3-4B scale training requires a CUDA GPU; pass --allow-cpu only for diagnostics")
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    output = Path(args.output).resolve()
    checkpoint = output / "checkpoint-final"
    output.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()

    samples = load_chat_samples(args.data)
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    encoded = [encode_response_only(sample, tokenizer, args.max_length) for sample in samples]
    cuda_dtype = torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else torch.float16
    quantization = None
    if args.qlora:
        quantization = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=cuda_dtype,
            bnb_4bit_use_double_quant=True,
        )
    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        dtype=cuda_dtype if torch.cuda.is_available() else torch.float32,
        quantization_config=quantization,
        device_map="auto" if torch.cuda.is_available() else None,
    )
    if args.qlora:
        model = prepare_model_for_kbit_training(model)
    model.config.use_cache = False
    model.gradient_checkpointing_enable()
    model.enable_input_require_grads()
    model = get_peft_model(model, LoraConfig(
        task_type="CAUSAL_LM",
        r=8,
        lora_alpha=16,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    ))
    trainable = sum(parameter.numel() for parameter in model.parameters() if parameter.requires_grad)
    optimizer = torch.optim.AdamW((parameter for parameter in model.parameters() if parameter.requires_grad), lr=args.learning_rate)
    order = list(range(len(encoded)))
    losses = []
    optimizer_steps = 0
    training_started = time.perf_counter()
    model.train()
    optimizer.zero_grad(set_to_none=True)
    for epoch in range(args.epochs):
        random.Random(args.seed + epoch).shuffle(order)
        for position, index in enumerate(order, start=1):
            item = encoded[index]
            device = next(model.parameters()).device
            batch = {key: torch.tensor([value], dtype=torch.long, device=device) for key, value in item.items()}
            loss = model(**batch).loss
            if loss is None or not torch.isfinite(loss):
                raise RuntimeError(f"non-finite loss for {samples[index].sample_id}")
            losses.append(float(loss.detach()))
            (loss / args.gradient_accumulation).backward()
            if position % args.gradient_accumulation == 0 or position == len(order):
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()
                optimizer.zero_grad(set_to_none=True)
                optimizer_steps += 1
                print(json.dumps({"epoch": epoch + 1, "optimizer_step": optimizer_steps, "loss": losses[-1]}), flush=True)
    training_seconds = time.perf_counter() - training_started
    model.save_pretrained(checkpoint)
    tokenizer.save_pretrained(checkpoint)
    del optimizer, model
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    reload_base = AutoModelForCausalLM.from_pretrained(
        args.model,
        dtype=cuda_dtype if torch.cuda.is_available() else torch.float32,
        device_map="auto" if torch.cuda.is_available() else None,
    )
    reloaded = PeftModel.from_pretrained(reload_base, checkpoint)
    reloaded.eval()
    prompt = tokenizer.apply_chat_template(
        [{"role": "user", "content": "Implement a TypeScript function named canPlay that checks whether energy covers a card cost."}],
        tokenize=False,
        add_generation_prompt=True,
        enable_thinking=False,
    )
    inputs = tokenizer(prompt, return_tensors="pt").to(next(reloaded.parameters()).device)
    with torch.inference_mode():
        generation = reloaded.generate(**inputs, max_new_tokens=48, do_sample=False, pad_token_id=tokenizer.eos_token_id)
    generated = tokenizer.decode(generation[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
    report = {
        "status": "passed",
        "freeze_name": freeze["freeze_name"],
        "dataset_sha256": freeze["dataset"]["sha256"],
        "base_model": args.model,
        "samples": len(samples),
        "epochs": args.epochs,
        "micro_steps": len(losses),
        "optimizer_steps": optimizer_steps,
        "max_length": args.max_length,
        "gradient_accumulation": args.gradient_accumulation,
        "learning_rate": args.learning_rate,
        "assistant_response_only_masking": True,
        "method": "QLoRA" if args.qlora else "LoRA",
        "trainable_parameters": trainable,
        "mean_loss": sum(losses) / len(losses),
        "first_loss": losses[0],
        "last_loss": losses[-1],
        "training_seconds": training_seconds,
        "total_seconds": time.perf_counter() - started,
        "checkpoint_path": str(checkpoint),
        "checkpoint_reload_succeeded": True,
        "generation_succeeded": bool(generated.strip()),
        "generated_text": generated,
    }
    (output / "train-run.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


def verify_freeze(args: argparse.Namespace, freeze: dict) -> None:
    data = Path(args.data)
    digest = hashlib.sha256(data.read_bytes()).hexdigest()
    expected = freeze["experiment"]
    training = expected["training"]
    checks = {
        "dataset path": str(data.as_posix()) == freeze["dataset"]["path"],
        "dataset hash": digest == freeze["dataset"]["sha256"],
        "base model": args.model == expected["base_model"],
        "QLoRA mode": args.qlora and expected["sft_method"] == "QLoRA",
        "epochs": args.epochs == training["epochs"],
        "max length": args.max_length == training["max_length"],
        "learning rate": args.learning_rate == training["learning_rate"],
        "gradient accumulation": args.gradient_accumulation == training["gradient_accumulation"],
    }
    failed = [name for name, passed in checks.items() if not passed]
    if failed:
        raise ValueError(f"training arguments do not match frozen experiment: {', '.join(failed)}")


if __name__ == "__main__":
    main()
