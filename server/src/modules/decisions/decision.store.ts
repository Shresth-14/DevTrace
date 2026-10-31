import type { Prisma, PrismaClient } from "@prisma/client";
import type { Candidate, DecisionStatus } from "./decision.types";
import {
  SIMILARITY_THRESHOLD,
  fingerprint,
  mergeStatus,
  similarity,
  titleTokens,
} from "./decision.validate";

type Tx = Prisma.TransactionClient;

/**
 * Persists validated candidates. Decisions seen again (same normalised title, possibly
 * from another thread) are merged into the existing row instead of duplicated.
 */
export class DecisionStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly db: PrismaClient) {}

  /** Saves are serialised so decision numbers (DEC-001...) are allocated without races. */
  public save(
    projectId: string,
    candidates: Candidate[],
    meta: { model: string; version: string }
  ): Promise<number> {
    const run = this.queue.then(() =>
      this.saveNow(projectId, candidates, meta)
    );
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async saveNow(
    projectId: string,
    candidates: Candidate[],
    meta: { model: string; version: string }
  ): Promise<number> {
    let saved = 0;
    for (const c of candidates) {
      await this.db.$transaction((tx) => this.saveOne(tx, projectId, c, meta));
      saved += 1;
    }
    return saved;
  }

  private async saveOne(
    tx: Tx,
    projectId: string,
    c: Candidate,
    meta: { model: string; version: string }
  ): Promise<void> {
    const existing = await tx.decision.findMany({
      where: { projectId },
      select: {
        id: true,
        seq: true,
        title: true,
        fingerprint: true,
        status: true,
        decidedAt: true,
        participants: true,
        confidence: true,
      },
    });
    const fp = fingerprint(c.title);
    const tokens = titleTokens(c.title);
    const match =
      existing.find((e) => e.fingerprint === fp) ??
      existing.find(
        (e) => similarity(titleTokens(e.title), tokens) >= SIMILARITY_THRESHOLD
      );

    const people = new Set<string>(
      [
        ...c.evidence.map((e) => e.item.author),
        ...c.alternatives.map((a) => a.proposedBy),
      ].filter((p): p is string => !!p)
    );

    let decisionId: string;
    if (!match) {
      const seq = existing.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
      const created = await tx.decision.create({
        data: {
          projectId,
          seq,
          fingerprint: fp,
          title: c.title,
          summary: c.summary,
          status: c.status,
          reasoning: c.reasoning,
          openQuestions: c.openQuestions,
          participants: [...people],
          confidence: c.confidence,
          model: meta.model,
          version: meta.version,
          decidedAt: c.decidedAt,
        },
      });
      decisionId = created.id;
    } else {
      decisionId = match.id;
      const newer =
        (c.decidedAt?.getTime() ?? 0) >= (match.decidedAt?.getTime() ?? 0);
      const previous = Array.isArray(match.participants)
        ? (match.participants as string[])
        : [];
      await tx.decision.update({
        where: { id: match.id },
        data: {
          status: mergeStatus(
            { status: match.status as DecisionStatus, at: match.decidedAt },
            { status: c.status, at: c.decidedAt }
          ),
          participants: [...new Set([...previous, ...people])],
          model: meta.model,
          version: meta.version,
          decidedAt: newer ? c.decidedAt : match.decidedAt,
          ...(newer
            ? {
                summary: c.summary,
                reasoning: c.reasoning,
                openQuestions: c.openQuestions,
                confidence: c.confidence,
              }
            : {}),
        },
      });
    }

    const evidenceId = new Map<string, string>();
    const allEvidence = [
      ...c.evidence,
      ...c.alternatives.flatMap((a) => a.evidence),
    ];
    for (const e of allEvidence) {
      const key = `${e.item.sourceType}:${e.item.sourceKey}`;
      if (evidenceId.has(key)) continue;
      const data = {
        threadKind: c.thread.kind,
        threadNumber: c.thread.number,
        author: e.item.author,
        quote: e.quote,
        url: e.item.url,
        occurredAt: e.item.at,
      };
      const row = await tx.decisionEvidence.upsert({
        where: {
          decisionId_sourceType_sourceKey: {
            decisionId,
            sourceType: e.item.sourceType,
            sourceKey: e.item.sourceKey,
          },
        },
        create: {
          decisionId,
          sourceType: e.item.sourceType,
          sourceKey: e.item.sourceKey,
          ...data,
        },
        update: data,
      });
      evidenceId.set(key, row.id);
    }

    for (const a of c.alternatives) {
      const alt = await tx.decisionAlternative.upsert({
        where: { decisionId_title: { decisionId, title: a.title } },
        create: {
          decisionId,
          title: a.title,
          proposedBy: a.proposedBy,
          reason: a.reason,
          status: a.status,
          chosenInstead: a.chosenInstead,
        },
        update: {
          proposedBy: a.proposedBy ?? undefined,
          reason: a.reason ?? undefined,
          status: a.status,
          chosenInstead: a.chosenInstead ?? undefined,
        },
      });
      const links = a.evidence
        .map((e) => evidenceId.get(`${e.item.sourceType}:${e.item.sourceKey}`))
        .filter((id): id is string => !!id);
      if (links.length) {
        await tx.alternativeEvidence.createMany({
          data: links.map((evidenceId) => ({
            alternativeId: alt.id,
            evidenceId,
          })),
          skipDuplicates: true,
        });
      }
    }

    for (const l of c.codeLinks) {
      await tx.decisionCodeLink.upsert({
        where: {
          decisionId_path_basis: { decisionId, path: l.path, basis: l.basis },
        },
        create: { decisionId, ...l },
        update: {
          previousPath: l.previousPath,
          relationship: l.relationship,
          description: l.description,
          commitSha: l.commitSha,
          line: l.line,
          prNumber: l.prNumber,
        },
      });
    }
  }
}
