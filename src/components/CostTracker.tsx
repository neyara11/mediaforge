import { useState, useEffect } from "react";
import { Coins } from "lucide-react";
import { getGenerations } from "../db";

export default function CostTracker() {
  const [todayCost, setTodayCost] = useState(0);
  const [monthCost, setMonthCost] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const gens = await getGenerations();
        const today = new Date().toISOString().split("T")[0];
        const month = today.substring(0, 7);
        let daySum = 0;
        let monthSum = 0;
        for (const g of gens) {
          const cost = g.costRub ?? 0;
          if (g.createdAt.startsWith(today)) daySum += cost;
          if (g.createdAt.startsWith(month)) monthSum += cost;
        }
        setTodayCost(daySum);
        setMonthCost(monthSum);
      } catch {
        console.debug("Database not available for cost tracking");
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="border-t border-zinc-800 p-3">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Coins className="h-3 w-3" />
        <span>
          Today: {todayCost.toFixed(2)}₽ · Month: {monthCost.toFixed(2)}₽
        </span>
      </div>
    </div>
  );
}
