# S? — <the question, restated in one line>

**Answer:** <yes | no | inconclusive, because…>

<Two or three sentences a reader can act on without reading further. If the answer
is no, say what we do instead. If inconclusive, say what would settle it and what it
would cost.>

| | |
|---|---|
| **Spike** | S? |
| **Run by** | |
| **Dates** | |
| **Timebox** | ? days — **used: ?** |
| **Branch** | `spike/S?` |
| **Verdict** | |

---

## Versions

Every finding below is a property of these exact versions. A finding without a
version is not reproducible.

| Component | Version / digest |
|---|---|
| macOS | |
| Docker Desktop | |
| Docker Engine | |
| <images, packages, language runtimes> | |

---

## Evidence

For each success criterion in the brief, the actual output — not a description of it.

### <criterion from the brief>

```
<terminal output, config that worked, screenshot path>
```

**Verdict:** pass / fail / not reached, and why.

---

## Sub-question answers

The brief's sub-questions, each traced to the design claim it supports. Answer every
one, including the ones that turned out not to matter.

| Sub-question | Answer | Evidence | Consequence |
|---|---|---|---|
| | | | |

---

## What survives

The named artefacts from the brief's *What survives the spike* section, copied out
of the throwaway branch. State where each now lives.

- **<artefact>** → `<path>`

---

## What did not work

Approaches tried and abandoned, with the reason. This section saves the next person
from repeating them, and it is often more valuable than the successes.

---

## Spec actions

Sentences in the design document that this spike shows to be wrong, overstated, or
now under-specified. **Do not edit the spec yourself** — it is marked *Approved
design* and edits are the human's call. Quote the sentence, cite the section, and
propose the replacement.

| Section | Current text | Proposed change | Why |
|---|---|---|---|

---

## Open questions

Anything this spike surfaced that it did not answer, and whether it needs its own
spike, a decision, or nothing.

---

## Manual steps that could not be automated

C1's bar is *"a new developer reaches a working loop from a clean checkout."* Every
manual step is a defect against it. List them even if they seem unavoidable — the
list is the input to `make doctor` and `make seed`.

- 
