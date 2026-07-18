/**
 * Reset the seed interview back to a fresh "not started" state so the lobby →
 * admit flow can be demoed again. Run: npm run db:reset
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const INTERVIEW_ID = process.argv[2] || "seed-interview";

async function main() {
  await prisma.roomSession.updateMany({
    where: { interviewId: INTERVIEW_ID },
    data: {
      candidateAdmittedAt: null,
      candidateFirstWaitingAt: null,
      interviewerJoinedAt: null,
      status: "scheduled",
      startedAt: null,
      endedAt: null,
      activeQuestionId: null,
      activeQuestionIndex: 0,
    },
  });
  await prisma.interview.update({
    where: { id: INTERVIEW_ID },
    data: { status: "scheduled", startedAt: null, endedAt: null, activeQuestionId: null, activeQuestionIndex: 0 },
  });
  console.log(`Reset interview '${INTERVIEW_ID}' to scheduled (candidate back in lobby).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
