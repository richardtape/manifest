# Waiting, and the five states

Five states. Every screen in the product uses only these, and the admin console should inherit them
rather than invent a second set.

| State | Means | Reads as | Tokens |
|---|---|---|---|
| **Working** | Moving on its own. You may leave. | a drifting bar, a breathing dot, an honest duration | `working` · `working-tint` · `working-border` |
| **Waiting on someone** | A person or an office has it. | still, with how long it has waited | `waiting` · `waiting-tint` · `waiting-border` |
| **Needs you** | Stuck until you act. | one clear action, and what is still true | `attention` · `attention-tint` · `attention-border` |
| **Steady** | It works. | a filled dot and a plain word | `steady` · `steady-tint` · `steady-border` |
| **Not yet** | Real, but no clock has started. | hatched, muted, no action implied | `ink-subtle` · `border-strong` dashed |

## How the platform's enums collapse into them

- `pending`, `building`, `provisioning`, `starting`, and a `running` build → **Working**
- `healthy`, and a `succeeded` build → **Steady**
- `failed`, and a question an agent is waiting on → **Needs you**
- `hibernated` → **Not yet**
- A launch item that is `not_built` → **Not yet**; one that is `unmet` and owned by somebody else →
  **Waiting on someone**

## The rule that generates the vocabulary

> **Motion means a machine is moving. Stillness plus a number means a person has it.**

So: `working` gets the drifting bar and the breathing dot, and always states a duration. `waiting`
is completely still and always carries an elapsed count. Nothing measured in weeks is ever
animated — a hatched, empty time bar labelled *Nothing counting yet* against *Takes weeks* is the
correct rendering of a clock that has not started.

There is no indeterminate spinner in this system. A spinner says *something is happening* and
nothing else, which is precisely the information a person already has.

## Two facts, never one

What is **serving** and what the **last attempt** did are different facts, and an interface that
shows one number is wrong about half the time. A failed change never takes away what people already
have: the previous version keeps answering until a new one proves it can.

Show both, side by side, with the serving fact in `steady-tint` and the attempt in whichever tint
its outcome earns. See the **TwoFacts** component. This was found the expensive way, and it is the
detail most likely to be dropped by someone rebuilding a screen from memory.
