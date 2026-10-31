# HACKATHON.md

## 1. Problem Statement

**Problem 6: Recover the Decisions Nobody Wrote Down**

We are building **DevTrace**, an AI-powered technical decision intelligence system that recovers technical decisions and the reasoning behind them from historical GitHub Issues, Pull Requests, Discussions, and other project conversations.

DevTrace transforms unstructured technical discussions into structured, evidence-backed decision records.

The system focuses on identifying:
- **Technical Decisions:** The final decisions made during project discussions.
- **Decision Rationale:** The reasoning behind technical decisions.
- **Rejected Alternatives:** Approaches that were considered but rejected, along with the reasons.
- **Supporting Evidence:** Links to original GitHub Issues, Pull Requests, comments, and Discussions.
- **Code Relationships:** Connections between historical decisions and relevant files or code sections.
- **Knowledge Retrieval:** Surfacing relevant historical decisions when contributors work on related code.

Our goal is to preserve the technical knowledge behind software projects so contributors can understand not only what was implemented, but also why certain approaches were accepted or rejected.

## 2. Models Used and Why

### Qwen 2.5 Coder 7B

- **Model ID:** `qwen2.5-coder:7b`
- **Type:** Open-weight Large Language Model (Alibaba Cloud / Qwen team, Apache 2.0).
- **Provider:** Ollama (native local offline inference runtime).
- **Execution:** 100% local offline execution on Apple Silicon M4 with Metal GPU acceleration. No external or third-party inference APIs are called.
- **Purpose:** Analysing historical technical conversations and reconstructing decisions, their reasoning, rejected alternatives, and supporting evidence.

**Why We Selected This Model**

DevTrace requires more than conventional text summarisation. It needs to understand complex technical discussions, code architectures, identify competing proposals, distinguish objections from final decisions, and recover the reasoning behind rejected alternatives.

We selected Qwen 2.5 Coder because of its state-of-the-art coding and reasoning capabilities, native grammar-constrained JSON execution, and optimal memory footprint (~4.7 GB in Q4_K_M GGUF format) that runs at high token velocity entirely within unified memory on Apple Silicon.

We use it for:

1. Extracting technical proposals and arguments from historical discussions.
2. Identifying supporting and opposing viewpoints.
3. Reconstructing accepted and rejected technical approaches.
4. Extracting the rationale behind technical decisions.
5. Generating structured decision records with supporting source references.

**Model Usage Transparency:** The model used by DevTrace is a 100% open-weight model under the permissive Apache 2.0 license, running strictly locally on the user's hardware via Ollama.

## 3. Team Information

**Team Name:** DevTrace

## 4. Team Members

1. Shresth Juyal
2. Arpit Tripathi
3. Arpit Goyal
