/**
 * Seed one runnable interview: an interviewer, an interviewee, an interview session,
 * and two questions — enough to boot a real room without any admin UI.
 *
 * Run: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TWO_SUM = {
  id: "q-two-sum",
  title: "Two Sum",
  statement:
    "Given an array of integers `nums` and an integer `target`, return the indices of the two numbers that add up to `target`.",
  difficulty: "easy",
  language: "python",
  examples: [
    { input: "nums = [2,7,11,15], target = 9", output: "[0,1]", explanation: "nums[0] + nums[1] == 9" },
  ],
  constraints: ["2 <= nums.length <= 10^4", "-10^9 <= nums[i] <= 10^9"],
  starterCode: {
    python: "class Solution:\n    def twoSum(self, nums, target):\n        pass\n",
    javascript: "function twoSum(nums, target) {\n  // ...\n}\n",
  },
  sampleTests: [
    { id: "t1", stdin: "[2,7,11,15]\n9", expected_output: "[0,1]" },
    { id: "t2", stdin: "[3,2,4]\n6", expected_output: "[1,2]" },
  ],
} as const;

const REVERSE_LL = {
  id: "q-reverse-ll",
  title: "Reverse Linked List",
  statement: "Given the head of a singly linked list, reverse the list and return the new head.",
  difficulty: "medium",
  language: "python",
  examples: [{ input: "head = [1,2,3]", output: "[3,2,1]" }],
  constraints: ["0 <= n <= 5000"],
  starterCode: {
    python: "class Solution:\n    def reverseList(self, head):\n        pass\n",
  },
  sampleTests: [{ id: "t1", stdin: "[1,2,3,4,5]", expected_output: "[5,4,3,2,1]" }],
} as const;

const VALID_PARENS = {
  id: "q-valid-parens",
  title: "Valid Parentheses",
  statement:
    "Given a string `s` containing just the characters `()[]{}`, determine if the input string is valid — brackets must close in the correct order.",
  difficulty: "easy",
  language: "python",
  examples: [
    { input: 's = "()[]{}"', output: "true" },
    { input: 's = "(]"', output: "false" },
  ],
  constraints: ["1 <= s.length <= 10^4"],
  starterCode: {
    python: "class Solution:\n    def isValid(self, s):\n        pass\n",
    javascript: "function isValid(s) {\n  // ...\n}\n",
  },
  sampleTests: [
    { id: "t1", stdin: "()[]{}", expected_output: "true" },
    { id: "t2", stdin: "(]", expected_output: "false" },
  ],
} as const;

const MERGE_INTERVALS = {
  id: "q-merge-intervals",
  title: "Merge Intervals",
  statement:
    "Given an array of `intervals` where `intervals[i] = [start, end]`, merge all overlapping intervals and return the non-overlapping intervals that cover all the input.",
  difficulty: "medium",
  language: "python",
  examples: [{ input: "intervals = [[1,3],[2,6],[8,10],[15,18]]", output: "[[1,6],[8,10],[15,18]]" }],
  constraints: ["1 <= intervals.length <= 10^4"],
  starterCode: {
    python: "class Solution:\n    def merge(self, intervals):\n        pass\n",
  },
  sampleTests: [{ id: "t1", stdin: "[[1,3],[2,6],[8,10],[15,18]]", expected_output: "[[1,6],[8,10],[15,18]]" }],
} as const;

const LRU_CACHE = {
  id: "q-lru-cache",
  title: "LRU Cache",
  statement:
    "Design a data structure that follows the constraints of a Least Recently Used (LRU) cache. Implement `get` and `put` in O(1) average time.",
  difficulty: "hard",
  language: "python",
  examples: [{ input: "capacity = 2; put(1,1); put(2,2); get(1)", output: "1" }],
  constraints: ["1 <= capacity <= 3000"],
  starterCode: {
    python: "class LRUCache:\n    def __init__(self, capacity):\n        pass\n",
  },
  sampleTests: [{ id: "t1", stdin: "2", expected_output: "1" }],
} as const;

const BANK = [TWO_SUM, REVERSE_LL, VALID_PARENS, MERGE_INTERVALS, LRU_CACHE] as const;

async function main() {
  const interviewer = await prisma.user.upsert({
    where: { id: "seed-interviewer" },
    update: {},
    create: { id: "seed-interviewer", name: "Sam Interviewer", email: "interviewer@probe.dev", role: "interviewer" },
  });

  const interviewee = await prisma.user.upsert({
    where: { id: "seed-interviewee" },
    update: {},
    create: { id: "seed-interviewee", name: "Riley Interviewee", email: "interviewee@probe.dev", role: "interviewee" },
  });

  for (const q of BANK) {
    await prisma.question.upsert({
      where: { id: q.id },
      update: {},
      create: {
        id: q.id,
        title: q.title,
        statement: q.statement,
        difficulty: q.difficulty,
        language: q.language,
        examples: q.examples as object,
        constraints: q.constraints as object,
        starterCode: q.starterCode as object,
        sampleTests: q.sampleTests as object,
      },
    });
  }

  const interview = await prisma.interview.upsert({
    where: { id: "seed-interview" },
    update: {},
    create: {
      id: "seed-interview",
      interviewerId: interviewer.id,
      intervieweeId: interviewee.id,
      status: "scheduled",
      scheduledAt: new Date(),
      durationMinutes: 60,
    },
  });

  await prisma.interviewQuestion.deleteMany({ where: { interviewId: interview.id } });
  await prisma.interviewQuestion.createMany({
    data: [
      { interviewId: interview.id, questionId: TWO_SUM.id, text: TWO_SUM.title, difficulty: TWO_SUM.difficulty, order: 0 },
      { interviewId: interview.id, questionId: REVERSE_LL.id, text: REVERSE_LL.title, difficulty: REVERSE_LL.difficulty, order: 1 },
    ],
  });

  await prisma.roomSession.upsert({
    where: { interviewId: interview.id },
    update: {},
    create: { interviewId: interview.id, status: "scheduled" },
  });

  console.log("Seeded interview:", interview.id);
  console.log("  interviewer:", interviewer.id, "| interviewee:", interviewee.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
