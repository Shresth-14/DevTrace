-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "aiStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "lastExtractedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ExtractionRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "phase" TEXT NOT NULL DEFAULT 'analyzing',
    "model" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "force" BOOLEAN NOT NULL DEFAULT false,
    "unitsTotal" INTEGER NOT NULL DEFAULT 0,
    "unitsDone" INTEGER NOT NULL DEFAULT 0,
    "unitsFailed" INTEGER NOT NULL DEFAULT 0,
    "decisionsSaved" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ExtractionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionUnit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "error" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reasoning" JSONB NOT NULL,
    "openQuestions" TEXT,
    "participants" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "model" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionEvidence" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "threadKind" TEXT NOT NULL,
    "threadNumber" INTEGER NOT NULL,
    "author" TEXT,
    "quote" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),

    CONSTRAINT "DecisionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionAlternative" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "proposedBy" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL,
    "chosenInstead" TEXT,

    CONSTRAINT "DecisionAlternative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlternativeEvidence" (
    "alternativeId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,

    CONSTRAINT "AlternativeEvidence_pkey" PRIMARY KEY ("alternativeId","evidenceId")
);

-- CreateTable
CREATE TABLE "DecisionCodeLink" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "previousPath" TEXT,
    "relationship" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "description" TEXT,
    "commitSha" TEXT,
    "line" INTEGER,
    "prNumber" INTEGER,

    CONSTRAINT "DecisionCodeLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExtractionRun_projectId_startedAt_idx" ON "ExtractionRun"("projectId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionUnit_projectId_kind_number_key" ON "ExtractionUnit"("projectId", "kind", "number");

-- CreateIndex
CREATE INDEX "Decision_projectId_status_idx" ON "Decision"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_projectId_seq_key" ON "Decision"("projectId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_projectId_fingerprint_key" ON "Decision"("projectId", "fingerprint");

-- CreateIndex
CREATE INDEX "DecisionEvidence_decisionId_idx" ON "DecisionEvidence"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionEvidence_decisionId_sourceType_sourceKey_key" ON "DecisionEvidence"("decisionId", "sourceType", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionAlternative_decisionId_title_key" ON "DecisionAlternative"("decisionId", "title");

-- CreateIndex
CREATE INDEX "DecisionCodeLink_decisionId_idx" ON "DecisionCodeLink"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionCodeLink_decisionId_path_basis_key" ON "DecisionCodeLink"("decisionId", "path", "basis");

-- AddForeignKey
ALTER TABLE "ExtractionRun" ADD CONSTRAINT "ExtractionRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionUnit" ADD CONSTRAINT "ExtractionUnit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionEvidence" ADD CONSTRAINT "DecisionEvidence_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionAlternative" ADD CONSTRAINT "DecisionAlternative_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlternativeEvidence" ADD CONSTRAINT "AlternativeEvidence_alternativeId_fkey" FOREIGN KEY ("alternativeId") REFERENCES "DecisionAlternative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlternativeEvidence" ADD CONSTRAINT "AlternativeEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "DecisionEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionCodeLink" ADD CONSTRAINT "DecisionCodeLink_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

