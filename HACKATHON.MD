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

### NVIDIA Nemotron 3 Ultra 550B A55B

- **Model ID:** `nvidia/nemotron-3-ultra-550b-a55b:free`
- **Type:** Open-weight Large Language Model.
- **Provider:** OpenRouter.
- **Execution:** Hosted inference API. The model is not downloaded or executed locally by the project.
- **Purpose:** Analysing historical technical conversations and reconstructing decisions, their reasoning, rejected alternatives, and supporting evidence.

**Why We Selected This Model**

DevTrace requires more than conventional text summarisation. It needs to understand complex technical discussions, identify competing proposals, distinguish objections from final decisions, and recover the reasoning behind rejected alternatives.

We selected NVIDIA Nemotron 3 Ultra as a candidate because of its reasoning capabilities, large context window, and suitability for complex multi-step analysis.

We intend to use it for:

1. Extracting technical proposals and arguments from historical discussions.
2. Identifying supporting and opposing viewpoints.
3. Reconstructing accepted and rejected technical approaches.
4. Extracting the rationale behind technical decisions.
5. Generating structured decision records with supporting source references.

**Model Usage Transparency:** The model and inference provider documented here reflect the intended integration. The hosted OpenRouter deployment is subject to confirmation of eligibility under the hackathon's open-model execution requirements.

## 3. Team Information

**Team Name:** DevTrace

## 4. Team Members

1. Shresth Juyal
2. Arpit Tripathi
3. Arpit Goyal
