import "dotenv/config";
import { PrismaClient } from "@prisma/client";

type TargetCategory =
  | "Interest Rate"
  | "Prices & Inflation"
  | "Labour Market"
  | "GDP Growth"
  | "Foreign Trade"
  | "Government"
  | "Business Confidence"
  | "Consumer Sentiment"
  | "Housing Market"
  | "Bond Auctions"
  | "Energy"
  | "Holidays"
  | "Earnings";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EXACT: Array<{ category: TargetCategory; names: string[] }> = [
  {
    category: "Interest Rate",
    names: [
      "FOMC Minutes",
      "Fed Beige Book",
      "Fed Interest Rate Decision",
      "Fed Press Conference",
      "Loan Officer Survey",
    ],
  },
  {
    category: "Prices & Inflation",
    names: [
      "Consumer Inflation Expectations",
      "Core PCE Price Index MoM",
      "Core PCE Price Index YoY",
      "Core PCE Prices QoQ",
      "Core Inflation Rate MoM",
      "Core Inflation Rate YoY",
      "Inflation Rate MoM",
      "Inflation Rate YoY",
      "CPI",
      "CPI S.A",
      "Michigan 5 Year Inflation Expectations",
      "Michigan Inflation Expectations",
      "PPI MoM",
      "Core PPI MoM",
      "Core PPI YoY",
      "PPI",
      "PPI Ex Food, Energy And Trade MoM",
      "PPI Ex Food, Energy And Trade YoY",
      "PPI YoY",
      "Export Prices MoM",
      "Import Prices MoM",
      "Export Prices YoY",
      "Import Prices YoY",
      "GDP Price Index QoQ",
      "PCE Price Index MoM",
      "PCE Price Index YoY",
      "PCE Prices QoQ",
    ],
  },
  {
    category: "Labour Market",
    names: [
      "ADP Employment Change Weekly",
      "Initial Jobless Claims",
      "Continuing Jobless Claims",
      "Jobless Claims 4-Week Average",
      "Employment Cost Index",
      "JOLTs Job Openings",
      "JOLTs Job Quits",
      "ADP Employment Change",
      "Challenger Job Cuts",
      "Nonfarm Productivity",
      "Unit Labour Costs",
    ],
  },
  {
    category: "GDP Growth",
    names: ["GDP Growth Rate QoQ", "GDP Sales QoQ", "Real Consumer Spending QoQ"],
  },
  {
    category: "Foreign Trade",
    names: [
      "Net Long-Term TIC Flows",
      "Overall Net Capital Flows",
      "Goods Trade Balance",
      "Balance Of Trade",
      "Exports",
      "Imports",
    ],
  },
  {
    category: "Government",
    names: ["Monthly Budget Statement"],
  },
  {
    category: "Business Confidence",
    names: [
      "LMI Logistics Managers Index",
      "Durable Goods Orders MoM",
      "Durable Goods Orders Ex Transp MoM",
      "Durable Goods Orders Ex Defense MoM",
      "Non Defense Goods Orders Ex Air",
      "Corporate Profits",
      "Wholesale Inventories MoM",
      "Factory Orders MoM",
      "Factory Orders Ex Transportation",
      "NFIB Business Optimism Index",
      "NY Empire State Manufacturing Index",
      "Philadelphia Fed Manufacturing Index",
      "NY Fed Services Activity Index",
      "Philly Fed Business Conditions",
      "Philly Fed Capex Index",
      "Philly Fed Employment",
      "Philly Fed New Orders",
      "Philly Fed Prices Paid",
      "Industrial Production MoM",
      "Capacity Utilization",
      "Industrial Production YoY",
      "Manufacturing Production MoM",
      "Manufacturing Production YoY",
      "Business Inventories MoM",
      "Retail Inventories Ex Autos MoM",
      "Chicago Fed National Activity Index",
      "S&P Global Composite PMI Flash",
      "S&P Global Manufacturing PMI Flash",
      "S&P Global Services PMI Flash",
      "Kansas Fed Composite Index",
      "Kansas Fed Manufacturing Index",
      "Dallas Fed Manufacturing Index",
      "Richmond Fed Manufacturing Index",
      "Richmond Fed Manufacturing Shipments Index",
      "Richmond Fed Services Revenues Index",
      "Dallas Fed Services Index",
      "Dallas Fed Services Revenues Index",
      "Chicago PMI",
      "S&P Global Manufacturing PMI Final",
      "ISM Manufacturing PMI",
      "ISM Manufacturing Employment",
      "ISM Manufacturing New Orders",
      "ISM Manufacturing Prices",
      "Total Vehicle Sales",
      "S&P Global Composite PMI Final",
      "S&P Global Services PMI Final",
      "ISM Services PMI",
      "ISM Services Business Activity",
      "ISM Services Employment",
      "ISM Services New Orders",
      "ISM Services Prices",
    ],
  },
  {
    category: "Consumer Sentiment",
    names: [
      "Redbook YoY",
      "RCM/TIPP Economic Optimism Index",
      "Used Car Prices MoM",
      "Used Car Prices YoY",
      "Consumer Credit Change",
      "Personal Income MoM",
      "Personal Spending MoM",
      "Real Personal Spending MoM",
      "Michigan Consumer Sentiment",
      "Michigan Consumer Expectations",
      "Michigan Current Conditions",
      "Retail Sales MoM",
      "Retail Sales Control Group MoM",
      "Retail Sales Ex Autos MoM",
      "Retail Sales Ex Gas/Autos MoM",
      "Retail Sales YoY",
    ],
  },
  {
    category: "Housing Market",
    names: [
      "MBA 30-Year Mortgage Rate",
      "MBA Mortgage Applications",
      "MBA Mortgage Market Index",
      "MBA Mortgage Refinance Index",
      "MBA Purchase Index",
      "15-Year Mortgage Rate",
      "30-Year Mortgage Rate",
      "Existing Home Sales",
      "Existing Home Sales MoM",
      "NAHB Housing Market Index",
      "Pending Home Sales MoM",
      "Pending Home Sales YoY",
      "House Price Index",
      "House Price Index MoM",
      "House Price Index YoY",
      "Case-Shiller Home Price Index MoM",
      "Case-Shiller Home Price Index YoY",
      "Building Permits Prel",
      "Building Permits Final",
      "Building Permits MoM Prel",
      "Building Permits MoM Final",
      "Housing Starts",
      "Housing Starts MoM",
      "New Home Sales",
      "New Home Sales MoM",
      "Construction Spending MoM",
      "Building Permits",
    ],
  },
  {
    category: "Bond Auctions",
    names: [
      "3-Year Note Auction",
      "17-Week Bill Auction",
      "10-Year Note Auction",
      "4-Week Bill Auction",
      "8-Week Bill Auction",
      "30-Year Bond Auction",
      "3-Month Bill Auction",
      "6-Month Bill Auction",
      "52-Week Bill Auction",
      "6-Week Bill Auction",
      "20-Year Bond Auction",
      "5-Year TIPS Auction",
      "2-Year Note Auction",
      "5-Year Note Auction",
      "2-Year FRN Auction",
      "7-Year Note Auction",
    ],
  },
  {
    category: "Energy",
    names: [
      "API Crude Oil Stock Change",
      "EIA Crude Oil Stocks Change",
      "EIA Gasoline Stocks Change",
      "EIA Crude Oil Imports Change",
      "EIA Cushing Crude Oil Stocks Change",
      "EIA Distillate Fuel Production Change",
      "EIA Distillate Stocks Change",
      "EIA Gasoline Production Change",
      "EIA Heating Oil Stocks Change",
      "EIA Refinery Crude Runs Change",
      "EIA Natural Gas Stocks Change",
      "Baker Hughes Oil Rig Count",
      "Baker Hughes Total Rigs Count",
    ],
  },
];

function hasAny(n: string, arr: string[]): boolean {
  return arr.some((x) => n.includes(x));
}

function inferCategoryByRule(nameRaw: string): TargetCategory | null {
  const n = normalize(nameRaw);

  if (n.includes("holiday")) return "Holidays";
  if (hasAny(n, ["earnings", "eps", "dividend"])) return "Earnings";
  if (
    hasAny(n, [
      "auction",
      "bill auction",
      "note auction",
      "bond auction",
      "tips auction",
      "frn auction",
    ])
  ) {
    return "Bond Auctions";
  }
  if (hasAny(n, ["fed "]) && hasAny(n, [" speech", " minutes", " beige book", " rate decision", " press conference"])) {
    return "Interest Rate";
  }
  if (hasAny(n, ["api ", "eia ", "baker hughes", "crude oil", "natural gas stocks"])) {
    return "Energy";
  }
  if (
    hasAny(n, [
      "cpi",
      "ppi",
      "pce",
      "inflation",
      "import prices",
      "export prices",
      "gdp price index",
    ])
  ) {
    return "Prices & Inflation";
  }
  if (
    hasAny(n, [
      "jobless",
      "employment",
      "unemployment",
      "payroll",
      "jolts",
      "wage",
      "labour",
      "labor",
      "adp",
      "challenger",
      "productivity",
    ])
  ) {
    return "Labour Market";
  }
  if (hasAny(n, ["gdp growth rate qoq", "gdp sales qoq", "real consumer spending qoq"])) {
    return "GDP Growth";
  }
  if (hasAny(n, ["balance of trade", "goods trade balance", "exports", "imports", "tic flows", "capital flows"])) {
    return "Foreign Trade";
  }
  if (hasAny(n, ["budget statement", "government budget", "government debt", "fiscal"])) {
    return "Government";
  }
  if (
    hasAny(n, [
      "mortgage",
      "housing",
      "home sales",
      "house price",
      "building permits",
      "construction spending",
      "case shiller",
      "nahb",
    ])
  ) {
    return "Housing Market";
  }
  if (
    hasAny(n, [
      "retail sales",
      "consumer credit",
      "redbook",
      "consumer sentiment",
      "consumer expectations",
      "current conditions",
      "personal income",
      "personal spending",
      "used car prices",
      "rcm tipp",
    ])
  ) {
    return "Consumer Sentiment";
  }
  if (
    hasAny(n, [
      "pmi",
      "industrial production",
      "capacity utilization",
      "factory orders",
      "business inventories",
      "manufacturing",
      "durable goods orders",
      "empire state",
      "fed services",
      "fed manufacturing",
      "vehicle sales",
      "lmi",
      "nfib",
      "logistics managers",
      "chicago fed national activity index",
      "kansas fed",
      "dallas fed",
      "richmond fed",
      "philly fed",
      "corporate profits",
      "new orders",
      "ism",
      "s p global",
    ])
  ) {
    return "Business Confidence";
  }

  return null;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const exactMap = new Map<string, TargetCategory>();
    for (const block of EXACT) {
      for (const name of block.names) {
        exactMap.set(normalize(name), block.category);
      }
    }

    const all = await prisma.macroIndicator.findMany({
      select: { id: true, name: true, category: true },
    });

    let changed = 0;
    let exact = 0;
    let rules = 0;
    const byCategory = new Map<string, number>();

    for (const row of all) {
      const norm = normalize(row.name);
      const fromExact = exactMap.get(norm) ?? null;
      const target = fromExact ?? inferCategoryByRule(row.name);
      if (!target) continue;
      if (row.category === target) continue;

      await prisma.macroIndicator.update({
        where: { id: row.id },
        data: { category: target },
      });
      changed += 1;
      if (fromExact) exact += 1;
      else rules += 1;
      byCategory.set(target, (byCategory.get(target) ?? 0) + 1);
    }

    const distribution = [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");
    console.log(
      `[reassign-macro-categories-filtered] total=${all.length} changed=${changed} exact=${exact} rules=${rules} by_category=${distribution}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[reassign-macro-categories-filtered] failed:", err);
  process.exit(1);
});
