export type PublicBlogFallbackPost = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverImage: string | null;
  content: string;
  authorId: string;
  author: {
    id: string;
    name: string;
    avatar: string | null;
  };
  status: "published";
  publishedAt: string;
  readTimeMinutes: number;
  views: number;
  tags: string[];
  featured: boolean;
  showAuthorName: boolean;
  createdAt: string;
  updatedAt: string;
};

const practersAuthor = {
  id: "probe-team",
  name: "Probe team",
  avatar: "/logo_small.svg",
};

export const publicBlogFallbackPosts: PublicBlogFallbackPost[] = [
  {
    id: "fallback-ai-mock-interview-platform-guide",
    slug: "how-to-choose-an-ai-mock-interview-platform",
    title: "How to Choose an AI Mock Interview Platform: A Practical Guide for Job Seekers",
    subtitle: "A no-fluff checklist for picking a practice tool that actually helps you answer better, not just feel productive.",
    coverImage: "/blog1.png",
    content: "",
    authorId: practersAuthor.id,
    author: practersAuthor,
    status: "published",
    publishedAt: "2026-06-02T00:00:00.000Z",
    readTimeMinutes: 21,
    views: 9,
    tags: ["AI Mock Interview"],
    featured: true,
    showAuthorName: true,
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
  },
  {
    id: "fallback-role-of-ai-interview-preparation",
    slug: "role-of-ai-in-interview-preparation",
    title: "Role of AI in interview preparation",
    subtitle: "A complete guide to help you land your dream job",
    coverImage: "/blog2.png",
    content: "",
    authorId: practersAuthor.id,
    author: practersAuthor,
    status: "published",
    publishedAt: "2026-05-26T00:00:00.000Z",
    readTimeMinutes: 10,
    views: 32,
    tags: ["AI interview"],
    featured: false,
    showAuthorName: true,
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
  },
  {
    id: "fallback-ai-mock-interview-questions-practice",
    slug: "ai-mock-interview-questions-practice-guide",
    title: "AI Mock Interview Questions: How to Practice Without Memorizing Answers",
    subtitle: "A practical guide to using interview questions for stronger examples, clearer structure, and better spoken answers.",
    coverImage: "/blog3.jpg",
    content: "",
    authorId: practersAuthor.id,
    author: practersAuthor,
    status: "published",
    publishedAt: "2026-06-04T00:00:00.000Z",
    readTimeMinutes: 14,
    views: 0,
    tags: ["AI Mock Interview Questions"],
    featured: false,
    showAuthorName: true,
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  },
];
