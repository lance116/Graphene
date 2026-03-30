export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji
  tier: "bronze" | "silver" | "gold" | "platinum";
};

type AchievementDef = {
  id: string;
  name: string;
  icon: string;
  tiers: { tier: Achievement["tier"]; threshold: number; description: string }[];
};

const definitions: AchievementDef[] = [
  {
    id: "papers",
    name: "Collector",
    icon: "\u{1F4DA}",
    tiers: [
      { tier: "bronze", threshold: 1, description: "Added first paper" },
      { tier: "silver", threshold: 50, description: "Added 50 papers" },
      { tier: "gold", threshold: 250, description: "Added 250 papers" },
      { tier: "platinum", threshold: 1000, description: "Added 1,000 papers" },
    ],
  },
  {
    id: "stars_given",
    name: "Stargazer",
    icon: "\u2B50",
    tiers: [
      { tier: "bronze", threshold: 1, description: "Starred first paper" },
      { tier: "silver", threshold: 50, description: "Starred 50 papers" },
      { tier: "gold", threshold: 250, description: "Starred 250 papers" },
      { tier: "platinum", threshold: 1000, description: "Starred 1,000 papers" },
    ],
  },
  {
    id: "stars_received",
    name: "Influential",
    icon: "\u{1F31F}",
    tiers: [
      { tier: "bronze", threshold: 1, description: "Paper starred by someone" },
      { tier: "silver", threshold: 50, description: "Papers starred 50 times" },
      { tier: "gold", threshold: 250, description: "Papers starred 250 times" },
      { tier: "platinum", threshold: 1000, description: "Papers starred 1,000 times" },
    ],
  },
  {
    id: "read",
    name: "Scholar",
    icon: "\u{1F393}",
    tiers: [
      { tier: "bronze", threshold: 1, description: "Marked first paper as read" },
      { tier: "silver", threshold: 50, description: "Read 50 papers" },
      { tier: "gold", threshold: 250, description: "Read 250 papers" },
      { tier: "platinum", threshold: 1000, description: "Read 1,000 papers" },
    ],
  },
  {
    id: "categories",
    name: "Polymath",
    icon: "\u{1F9E0}",
    tiers: [
      { tier: "bronze", threshold: 3, description: "Papers in 3 categories" },
      { tier: "silver", threshold: 8, description: "Papers in 8 categories" },
      { tier: "gold", threshold: 15, description: "Papers in 15 categories" },
      { tier: "platinum", threshold: 25, description: "Papers in 25 categories" },
    ],
  },
  {
    id: "streak",
    name: "Consistent",
    icon: "\u{1F525}",
    tiers: [
      { tier: "bronze", threshold: 3, description: "3-day streak" },
      { tier: "silver", threshold: 14, description: "14-day streak" },
      { tier: "gold", threshold: 30, description: "30-day streak" },
      { tier: "platinum", threshold: 90, description: "90-day streak" },
    ],
  },
  {
    id: "early_adopter",
    name: "Pioneer",
    icon: "\u{1F680}",
    tiers: [
      { tier: "gold", threshold: 1, description: "Joined during early access" },
    ],
  },
];

export type Stats = {
  papers: number;
  stars_given: number;
  stars_received: number;
  read: number;
  categories: number;
  streak: number;
  early_adopter: number; // 1 or 0
};

export function computeAchievements(stats: Stats): Achievement[] {
  const earned: Achievement[] = [];

  for (const def of definitions) {
    const value = stats[def.id as keyof Stats] || 0;
    // Find the highest tier the user qualifies for
    let best: (typeof def.tiers)[number] | null = null;
    for (const t of def.tiers) {
      if (value >= t.threshold) best = t;
    }
    if (best) {
      earned.push({
        id: def.id,
        name: def.name,
        description: best.description,
        icon: def.icon,
        tier: best.tier,
      });
    }
  }

  return earned;
}

export function nextAchievements(stats: Stats): (Achievement & { current: number; needed: number })[] {
  const next: (Achievement & { current: number; needed: number })[] = [];

  for (const def of definitions) {
    const value = stats[def.id as keyof Stats] || 0;
    // Find the next tier the user hasn't reached
    for (const t of def.tiers) {
      if (value < t.threshold) {
        next.push({
          id: def.id,
          name: def.name,
          description: t.description,
          icon: def.icon,
          tier: t.tier,
          current: value,
          needed: t.threshold,
        });
        break;
      }
    }
  }

  return next;
}
