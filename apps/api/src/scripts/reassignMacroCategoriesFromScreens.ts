import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const SCREEN_CATEGORIES: Record<string, string[]> = {
  Markets: ["Currency", "Government Bond 10Y", "Stock Market"],
  GDP: [
    "Full Year GDP Growth",
    "GDP",
    "GDP Annual Growth Rate",
    "GDP Constant Prices",
    "GDP From Agriculture",
    "GDP From Construction",
    "GDP From Government",
    "GDP From Manufacturing",
    "GDP From Mining",
    "GDP From Services",
    "GDP From Transport",
    "GDP From Utilities",
    "GDP Growth Contribution Consumer Spending",
    "GDP Growth Contribution Exports",
    "GDP Growth Contribution Government",
    "GDP Growth Contribution Imports",
    "GDP Growth Contribution Investment",
    "GDP Growth Rate",
    "GDP Per Capita",
    "GDP Per Capita PPP",
    "GDP Sales",
    "Gross Fixed Capital Formation",
    "Gross National Product",
    "Real Consumer Spending",
    "Weekly Economic Index",
  ],
  Labour: [
    "ADP Employment Change",
    "ADP Employment Change - Large Firms",
    "ADP Employment Change - Mid-Sized Firms",
    "ADP Employment Change - Small Firms",
    "ADP Employment Change Weekly",
    "Average Annual Wages",
    "Average Hourly Earnings MoM",
    "Average Hourly Earnings YoY",
    "Average Weekly Hours",
    "Challenger Hiring Plans",
    "Challenger Job Cuts",
    "Chicago Fed Hiring Rate",
    "Chicago Fed Layoffs Rate",
    "Continuing Jobless Claims",
    "Continuing Jobless Claims - Federal Workers",
    "Earnings Growth Expectations",
    "Employed Persons",
    "Employment Cost Index",
    "Employment Rate",
    "Full Time Employment",
    "Government Payrolls",
    "Gross Average Monthly Wages",
    "Initial Jobless Claims",
    "Initial Jobless Claims - Federal Workers",
    "Job Layoffs And Discharges",
    "Job Openings",
    "Job Quits Rate",
    "Jobless Claims 4-Week Average",
    "JOLTs Job Openings",
    "JOLTs Jo Quits",
    "Labour Costs",
    "Long Term Unemployment Rate",
    "Manufacturing Payrolls",
    "Mean Unemployment Rate Expectations",
    "Minimum Wages",
    "Non Farm Payrolls",
    "Nonfarm Payrolls Private",
    "Nonfarm Productivity",
    "Part Time Employment",
    "Participation Rate",
    "Population",
    "Productivity",
    "Real Average Hourly Earnings MoM",
    "Real Average Hourly Earnings YoY",
    "Retirement Age Men",
    "Retirement Age Women",
    "U-6 Unemployment Rate",
    "Unemployed Persons",
    "Unemployment Rate",
    "Unit Labour Costs",
    "Wage Growth",
    "Wages",
    "Wages In Manufacturing",
    "Youth Unemployment Rate",
  ],
  Prices: [
    "3-Year Consumer Inflation Expectations",
    "5-Year Consumer Inflation Expectations",
    "Consumer Inflation Expectations",
    "Core Consumer Prices",
    "Core Inflation Rate MoM",
    "Core Inflation Rate YoY",
    "Core PCE Price Index",
    "Core PCE Price Index MoM",
    "Core PCE Price Index YoY",
    "Core PCE Prices QoQ",
    "Core PPI MoM",
    "Core PPI YoY",
    "Core Producer Prices",
    "CPI",
    "CPI Apparel",
    "CPI Core Core YoY",
    "CPI Education",
    "CPI Food",
    "CPI Housing Utilities",
    "CPI Median",
    "CPI Recreation",
    "CPI S.A",
    "CPI Transportation",
    "CPI Trimmed-Mean",
    "Energy Inflation",
    "Export Prices",
    "Export Prices MoM",
    "Export Prices YoY",
    "Food Inflation",
    "GDP Price Index",
    "Import Prices",
    "Import Prices MoM",
    "Import Prices YoY",
    "Inflation Rate MoM",
    "Inflation Rate YoY",
    "Michigan 5 Year Inflation Expectations",
    "Michigan Inflation Expectations",
    "PCE Price Index",
    "PCE Price Index MoM",
    "PCE Price Index YoY",
    "PCE Prices QoQ",
    "PPI",
    "PPI Ex Food Energy And Trade Services",
    "PPI Ex Food, Energy And Trade MoM",
    "PPI Ex Food, Energy And Trade YoY",
    "PPI MoM",
    "PPI YoY",
    "Services Inflation",
    "Shelter Inflation",
  ],
  Money: [
    "Banks Balance Sheet",
    "Effective Federal Funds Rate",
    "Fed Balance Sheet",
    "Fed Capital Account Surplus",
    "Fed Interest Rate",
    "Foreign Bond Investment",
    "Foreign Exchange Reserves",
    "Loans To Private Sector",
    "Money Supply M0",
    "Money Supply M1",
    "Money Supply M2",
    "Private Debt To GDP",
    "Proxy Funds Rate",
    "Secured Overnight Financing Rate",
  ],
  Trade: [
    "Auto Exports",
    "Balance Of Trade",
    "Crude Oil Production",
    "Current Account",
    "Current Account Services",
    "Current Account To GDP",
    "Exports",
    "Exports By Category",
    "Exports By Country",
    "External Debt",
    "Foreign Direct Investment",
    "Foreign Treasury Holdings",
    "Foreign Treasury Holdings - Belgium",
    "Foreign Treasury Holdings - Canada",
    "Foreign Treasury Holdings - China",
    "Foreign Treasury Holdings - Japan",
    "Foreign Treasury Holdings - UK",
    "Gold Reserves",
    "Goods Exports",
    "Goods Imports",
    "Goods Trade Balance",
    "Imports",
    "Imports By Category",
    "Imports By Country",
    "Net Long-Term TIC Flows",
    "Oil Exports",
    "Overall Net Capital Flows",
    "Terms Of Trade",
    "Terrorism Index",
    "Tourism Revenues",
    "Tourist Arrivals",
    "Weapons Sales",
    "Weekly Crude Oil Production",
  ],
  Government: [
    "Asylum Applications",
    "Corruption Index",
    "Corruption Rank",
    "Credit Rating",
    "Fiscal Expenditure",
    "Government Budget",
    "Government Debt",
    "Government Debt To GDP",
    "Government Revenues",
    "Government Spending",
    "Government Spending To GDP",
    "Holidays",
    "Military Expenditure",
    "Monthly Budget Statement",
  ],
  Business: [
    "Average Equipment Rate",
    "Bankruptcies",
    "Business Inventories MoM",
    "Capacity Utilization",
    "Car Loan Delinquency",
    "Car Production",
    "Car Registrations",
    "Changes In Inventories",
    "Chicago Fed National Activity Index",
    "Chicago PMI",
    "Coincident Index",
    "Composite Leading Indicator",
    "Corporate Profits",
    "Dallas Fed Manufacturing Index",
    "Dallas Fed Services Index",
    "Dry-Van Rate",
    "Durable Goods Orders MoM",
    "Factory Orders Ex Transportation",
    "Factory Orders MoM",
    "Industrial Production MoM",
    "Industrial Production YoY",
    "ISM Manufacturing PMI",
    "ISM Services PMI",
    "Kansas Fed Manufacturing Index",
    "Leading Economic Index",
    "LMI Logistics Managers Index",
    "Manufacturing Production MoM",
    "Manufacturing Production YoY",
    "Mining Production",
    "New Orders",
    "NFIB Business Optimism Index",
    "Non Defense Goods Orders Ex Air",
    "NY Empire State Manufacturing Index",
    "NY Fed Services Activity Index",
    "Philadelphia Fed Manufacturing Index",
    "Retail Inventories Ex Autos MoM",
    "Richmond Fed Manufacturing Index",
    "Richmond Fed Services Index",
    "Steel Production",
    "Total Vehicle Sales",
    "Wholesale Inventories MoM",
  ],
  Consumer: [
    "Bank Lending Rate",
    "Chain Store Sales",
    "Consumer Credit Change",
    "Consumer Spending",
    "Credit Card Accounts",
    "Debt Balance Auto Loans",
    "Debt Balance Credit Cards",
    "Debt Balance Mortgages",
    "Debt Balance Student Loans",
    "Disposable Personal Income",
    "Gasoline Prices",
    "Households Debt To GDP",
    "Michigan Consumer Expectations",
    "Michigan Consumer Sentiment",
    "Michigan Current Conditions",
    "Personal Income MoM",
    "Personal Savings",
    "Personal Spending MoM",
    "Private Sector Credit",
    "RCM/TIPP Economic Optimism Index",
    "Real Personal Spending MoM",
    "Redbook YoY",
    "Retail Monitor YoY",
    "Retail Sales Building And Garden Supply Stores MoM",
    "Retail Sales Car Dealers MoM",
    "Retail Sales Clothing Stores MoM",
    "Retail Sales Control Group MoM",
    "Retail Sales Electronics Stores MoM",
    "Retail Sales Ex Autos MoM",
    "Retail Sales Ex Gas MoM",
    "Retail Sales Ex Gas/Autos MoM",
    "Retail Sales Food And Beverage Stores MoM",
    "Retail Sales Furniture Stores MoM",
    "Retail Sales Gasoline Stations MoM",
    "Retail Sales General Merchandise Stores MoM",
    "Retail Sales Health And Personal Care Stores MoM",
    "Retail Sales Miscellaneous Store Retailers MoM",
    "Retail Sales MoM",
    "Retail Sales Online Trade MoM",
    "Retail Sales Restaurants And Bars MoM",
    "Retail Sales Sporting Goods And Hobby Stores MoM",
    "Retail Sales YoY",
    "Total Household Debt",
    "Used Car Prices MoM",
    "Used Car Prices YoY",
  ],
  Housing: [
    "15-Year Mortgage Rate",
    "30-Year Mortgage Rate",
    "Average House Prices",
    "Average Mortgage Size",
    "Building Permits",
    "Building Permits MoM",
    "Case-Shiller Home Price Index",
    "Case-Shiller Home Price Index MoM",
    "Case-Shiller Home Price Index YoY",
    "Case-Shiller Single Family Home Price Index",
    "Construction Spending MoM",
    "Existing Home Sales",
    "Existing Home Sales MoM",
    "Existing Home Sales Prices",
    "Home Ownership Rate",
    "House Price Index",
    "House Price Index MoM",
    "House Price Index YoY",
    "Housing Starts",
    "Housing Starts MoM",
    "Housing Starts Multi Family",
    "Housing Starts Single Family",
    "MBA 30-Year Mortgage Rate",
    "MBA Mortgage Applications",
    "MBA Mortgage Market Index",
    "MBA Mortgage Refinance Index",
    "MBA Purchase Index",
    "Mortgage Originations",
    "NAHB Housing Market Index",
    "New Home Sales",
    "New Home Sales MoM",
    "Pending Home Sales MoM",
    "Pending Home Sales YoY",
    "Price To Rent Ratio",
    "Residential Property Prices",
    "Total Housing Inventory",
  ],
  Taxes: [
    "Corporate Tax Rate",
    "Personal Income Tax Rate",
    "Sales Tax Rate",
    "Social Security Rate",
    "Social Security Rate For Companies",
    "Social Security Rate For Employees",
    "Withholding Tax Rate",
  ],
  Energy: [
    "API Crude Oil Stock Change",
    "API Cushing Number",
    "API Distillate Stocks",
    "API Gasoline Stocks",
    "Baker Hughes Oil Rig Count",
    "Baker Hughes Total Rigs Count",
    "EIA Crude Oil Imports Change",
    "EIA Crude Oil Stocks Change",
    "EIA Cushing Crude Oil Stocks Change",
    "EIA Distillate Fuel Production Change",
    "EIA Distillate Stocks Change",
    "EIA Gasoline Production Change",
    "EIA Gasoline Stocks Change",
    "EIA Heating Oil Stocks Change",
    "EIA Natural Gas Stocks Change",
    "EIA Refinery Crude Runs Change",
    "Strategic Petroleum Reserve Crude Oil Stocks",
  ],
  Health: ["Hospital Beds", "Hospitals", "Medical Doctors", "Nurses"],
  Climate: ["CO2 Emissions", "Precipitation", "Temperature"],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsa\b/g, "s a")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const indicators = await prisma.macroIndicator.findMany({
      select: { id: true, name: true, category: true },
    });

    const rawEntries: Array<{ category: string; name: string; norm: string; tokens: Set<string> }> = [];
    for (const [category, names] of Object.entries(SCREEN_CATEGORIES)) {
      for (const name of names) {
        rawEntries.push({ category, name, norm: normalize(name), tokens: tokenSet(name) });
      }
    }

    const byNorm = new Map<string, { category: string; name: string }>();
    for (const e of rawEntries) byNorm.set(e.norm, { category: e.category, name: e.name });

    let exactMatched = 0;
    let fuzzyMatched = 0;
    let changed = 0;
    const unmatched: string[] = [];

    for (const ind of indicators) {
      const norm = normalize(ind.name);
      let pickedCategory: string | null = null;

      const exact = byNorm.get(norm);
      if (exact) {
        pickedCategory = exact.category;
        exactMatched += 1;
      } else {
        const tokens = tokenSet(ind.name);
        let bestScore = 0;
        let secondScore = 0;
        let bestCategory: string | null = null;

        for (const e of rawEntries) {
          const score = jaccard(tokens, e.tokens);
          if (score > bestScore) {
            secondScore = bestScore;
            bestScore = score;
            bestCategory = e.category;
          } else if (score > secondScore) {
            secondScore = score;
          }
        }

        if (bestCategory && bestScore >= 0.78 && bestScore - secondScore >= 0.08) {
          pickedCategory = bestCategory;
          fuzzyMatched += 1;
        }
      }

      if (!pickedCategory) {
        unmatched.push(ind.name);
        continue;
      }

      if (ind.category !== pickedCategory) {
        await prisma.macroIndicator.update({
          where: { id: ind.id },
          data: { category: pickedCategory },
        });
        changed += 1;
      }
    }

    console.log(
      `[reassign-macro-categories] total=${indicators.length} exact=${exactMatched} fuzzy=${fuzzyMatched} changed=${changed} unmatched=${unmatched.length}`,
    );
    if (unmatched.length > 0) {
      console.log("[reassign-macro-categories] first_unmatched=", unmatched.slice(0, 40).join(" | "));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[reassign-macro-categories] failed:", err);
  process.exit(1);
});
