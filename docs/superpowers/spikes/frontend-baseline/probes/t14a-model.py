import sys, time, json, importlib.metadata as m
import litellm
print("litellm", m.version("litellm"))
model = sys.argv[1]; think = sys.argv[2]; label = sys.argv[3]
kw = dict(model="ollama_chat/" + model, api_base="http://host.docker.internal:11434",
          messages=[{"role": "user", "content": "In one short sentence, what is a bulletin board?"}],
          stream=True, max_tokens=int(sys.argv[4]) if len(sys.argv) > 4 else 200)
if think == "false": kw["think"] = False
t0 = time.time(); first = None; frames = 0; content_frames = 0; reasoning_frames = 0; text = ""
for chunk in litellm.completion(**kw):
    frames += 1
    d = chunk.choices[0].delta
    c = getattr(d, "content", None); r = getattr(d, "reasoning_content", None)
    if c:
        content_frames += 1; text += c
        if first is None: first = time.time() - t0
    if r: reasoning_frames += 1
total = time.time() - t0
print(json.dumps({"label": label, "model": model, "think": think, "frames": frames, "content_frames": content_frames,
                  "reasoning_frames": reasoning_frames, "first_content_s": None if first is None else round(first, 2),
                  "total_s": round(total, 2), "text": text[:160]}))
