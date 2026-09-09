from __future__ import annotations

import gc
import json
import random
import time
from pathlib import Path

import torch
from peft import LoraConfig, PeftModel, get_peft_model, prepare_model_for_kbit_training
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

from data_pipeline.v3.common import ROOT, sha256_file, write_json
from training.sft_smoke.data import encode_response_only, load_chat_samples


def main() -> None:
    freeze_path = ROOT / "data_pipeline/v3/freeze-manifest.json"
    freeze = json.loads(freeze_path.read_text(encoding="utf-8"))
    verify_freeze(freeze)
    if not torch.cuda.is_available():
        raise RuntimeError("sft:final:train requires a CUDA GPU")
    config = freeze["training"]
    model_name = config["base_model"]
    output = ROOT / "artifacts/final-sft"
    checkpoint = output / "checkpoint-final"
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / "training-config.json", config)
    random.seed(config["seed"]); torch.manual_seed(config["seed"])
    samples = load_chat_samples(ROOT / freeze["dataset"]["path"])
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    encoded = [encode_response_only(sample, tokenizer, config["max_length"]) for sample in samples]
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=dtype, bnb_4bit_use_double_quant=True)
    started = time.perf_counter()
    model = AutoModelForCausalLM.from_pretrained(model_name, quantization_config=quant, dtype=dtype, device_map="auto")
    model = prepare_model_for_kbit_training(model)
    model.config.use_cache = False; model.gradient_checkpointing_enable(); model.enable_input_require_grads()
    model = get_peft_model(model, LoraConfig(task_type="CAUSAL_LM", r=config["lora_rank"], lora_alpha=config["lora_alpha"],
        lora_dropout=config["lora_dropout"], target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]))
    trainable = sum(parameter.numel() for parameter in model.parameters() if parameter.requires_grad)
    total = sum(parameter.numel() for parameter in model.parameters())
    optimizer = torch.optim.AdamW((parameter for parameter in model.parameters() if parameter.requires_grad), lr=config["learning_rate"])
    order = list(range(len(encoded))); losses = []; steps = 0
    loss_log = (output / "loss.jsonl").open("w", encoding="utf-8")
    model.train(); optimizer.zero_grad(set_to_none=True); training_started = time.perf_counter()
    try:
        for epoch in range(config["epochs"]):
            random.Random(config["seed"] + epoch).shuffle(order)
            for position, index in enumerate(order, start=1):
                item = encoded[index]; device = next(model.parameters()).device
                batch = {key: torch.tensor([value], dtype=torch.long, device=device) for key, value in item.items()}
                loss = model(**batch).loss
                if loss is None or not torch.isfinite(loss):
                    raise RuntimeError(f"non-finite loss for {samples[index].sample_id}")
                value = float(loss.detach()); losses.append(value); (loss / config["gradient_accumulation"]).backward()
                if position % config["gradient_accumulation"] == 0 or position == len(order):
                    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); optimizer.step(); optimizer.zero_grad(set_to_none=True); steps += 1
                    event = {"epoch": epoch + 1, "optimizer_step": steps, "micro_step": position, "loss": value}
                    loss_log.write(json.dumps(event) + "\n"); loss_log.flush(); print(json.dumps(event), flush=True)
    finally:
        loss_log.close()
    training_seconds = time.perf_counter() - training_started
    model.save_pretrained(checkpoint); tokenizer.save_pretrained(checkpoint)
    del optimizer, model; gc.collect(); torch.cuda.empty_cache()
    reload_base = AutoModelForCausalLM.from_pretrained(model_name, quantization_config=quant, dtype=dtype, device_map="auto")
    reloaded = PeftModel.from_pretrained(reload_base, checkpoint); reloaded.eval()
    prompt = tokenizer.apply_chat_template([{"role": "user", "content": "Create an artifact JSON with one TypeScript file exporting canPlay."}],
                                           tokenize=False, add_generation_prompt=True, enable_thinking=False)
    inputs = tokenizer(prompt, return_tensors="pt").to(next(reloaded.parameters()).device)
    with torch.inference_mode():
        generated = reloaded.generate(**inputs, max_new_tokens=64, do_sample=False, pad_token_id=tokenizer.eos_token_id)
    text = tokenizer.decode(generated[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
    report = {"status": "passed", "base_model": model_name, "gpu": torch.cuda.get_device_name(0), "samples": len(samples),
              "method": "QLoRA", "trainable_parameters": trainable, "total_loaded_parameters": total,
              "optimizer_steps": steps, "epochs": config["epochs"], "first_loss": losses[0], "last_loss": losses[-1],
              "mean_loss": sum(losses) / len(losses), "training_seconds": training_seconds,
              "total_seconds": time.perf_counter() - started, "checkpoint": str(checkpoint),
              "checkpoint_reload_succeeded": True, "post_load_generation_succeeded": bool(text.strip()), "generated_text": text}
    write_json(output / "train-run.json", report); print(json.dumps(report, indent=2))


def verify_freeze(freeze: dict) -> None:
    if freeze.get("status") != "frozen" or freeze.get("freeze_name") != "final-sft-data-v3":
        raise RuntimeError("Data Pipeline v3 is not frozen")
    data = ROOT / freeze["dataset"]["path"]
    if sha256_file(data) != freeze["dataset"]["sha256"]:
        raise RuntimeError("frozen dataset hash mismatch")
    if freeze["training"]["base_model"] != "Qwen/Qwen3-4B" or not freeze["training"]["assistant_response_only_loss"]:
        raise RuntimeError("frozen training contract mismatch")


if __name__ == "__main__":
    main()
