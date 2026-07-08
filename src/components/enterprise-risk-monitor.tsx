"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Factory,
  AlertTriangle,
  ShieldCheck,
  Truck,
  MapPin,
} from "lucide-react";
import type { Outbreak } from "@/types/domain";
import { REGION_PROPERTIES, REGION_CENTROIDS } from "@/data/regions";
import { findConnectedRegions } from "@/data/transport-graph";

interface Enterprise {
  id: string;
  name: string;
  type: "farm" | "meat_plant" | "market" | "dairy" | "pig_farm" | "poultry_farm" | "cattle_farm" | "feed_mill" | "vet_clinic" | "slaughterhouse";
  lat: number;
  lon: number;
  region?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  outbreaks: Outbreak[];
  enterprises: Enterprise[];
}

const ENTERPRISE_ICONS: Record<string, string> = {
  farm: "🏭",
  meat_plant: "🔪",
  market: "🏪",
  dairy: "🥛",
};

const ENTERPRISE_LABELS: Record<string, string> = {
  farm: "Ферма/комплекс",
  meat_plant: "Мясокомбинат",
  market: "Рынок",
  dairy: "Молочный завод",
};

/**
 * Enterprise Risk Monitor — warns when outbreaks threaten major agricultural enterprises.
 *
 * Math:
 * 1. For each enterprise, find distance to nearest ONGOING outbreak
 * 2. If distance < disease restriction_zone_km → CRITICAL
 * 3. If distance < disease surveillance_zone_km → HIGH
 * 4. Check transport graph: if outbreak region is connected to enterprise region
 *    within 2 hops → add transport risk factor
 * 5. Estimate truck arrival time: distance_km / 55 km/h (avg livestock truck speed in Russia)
 */
export function EnterpriseRiskMonitor({ open, onOpenChange, outbreaks, enterprises }: Props) {
  const [filter, setFilter] = useState<"all" | "critical" | "high">("all");

  const assessments = useMemo(() => {
    // Get region centroids from REGION_CENTROIDS map (RegionProperties
    // doesn't have lat/lon fields — this used to be a silent bug producing
    // undefined coords, which made all distance calculations NaN).
    const regionCoords = new Map<string, [number, number]>();
    for (const name of Object.keys(REGION_PROPERTIES)) {
      const c = REGION_CENTROIDS[name];
      if (c) regionCoords.set(name, c);
    }

    // Only ongoing outbreaks
    const ongoing = outbreaks.filter((o) => o.status === "Ongoing" || o.status === "Unknown");
    const activeOutbreaks = ongoing.length > 0 ? ongoing : outbreaks;

    return enterprises
      .map((ent) => {
        // Find nearest outbreak by distance
        let nearestOutbreak: Outbreak | null = null;
        let minDistKm = Infinity;

        for (const o of activeOutbreaks) {
          // Use outbreak coords if available, else region centroid
          let oLat: number | undefined = o.lat;
          let oLon: number | undefined = o.lon;
          if ((!oLat || !oLon || (oLat === 0 && oLon === 0)) && o.region_geo) {
            const c = regionCoords.get(o.region_geo);
            if (c) { oLat = c[0]; oLon = c[1]; }
          }
          if (!oLat || !oLon) continue;

          // Haversine formula (proper spherical distance)
          const R = 6371; // Earth radius km
          const dLat = ((ent.lat - oLat) * Math.PI) / 180;
          const dLon = ((ent.lon - oLon) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((oLat * Math.PI) / 180) *
              Math.cos((ent.lat * Math.PI) / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const dist = R * c;

          if (dist < minDistKm) {
            minDistKm = dist;
            nearestOutbreak = o;
          }
        }

        // Check transport graph risk
        let transportRisk = false;
        let transportHops = 0;
        if (nearestOutbreak?.region_geo) {
          const connected = findConnectedRegions(nearestOutbreak.region_geo, 2);
          // Check if enterprise is in a connected region (rough match by region name)
          const entRegionNormalized = ent.region?.toLowerCase() || "";
          for (const node of connected) {
            const nodeName = node.region.toLowerCase();
            if (entRegionNormalized.includes(nodeName) || nodeName.includes(entRegionNormalized.split(" ")[0])) {
              transportRisk = true;
              transportHops = node.hops;
              break;
            }
          }
        }

        // Risk level
        let level: "critical" | "high" | "moderate" | "low" = "low";
        if (minDistKm < 30) level = "critical";
        else if (minDistKm < 100) level = "high";
        else if (minDistKm < 300 || transportRisk) level = "moderate";

        // Truck arrival time (55 km/h average for livestock transport in Russia)
        const truckSpeedKmh = 55;
        const arrivalHours = minDistKm === Infinity ? null : minDistKm / truckSpeedKmh;

        return {
          enterprise: ent,
          nearestOutbreak,
          distanceKm: minDistKm === Infinity ? null : Math.round(minDistKm),
          level,
          transportRisk,
          transportHops,
          arrivalHours: arrivalHours ? Math.round(arrivalHours * 10) / 10 : null,
        };
      })
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [outbreaks, enterprises]);

  const filtered = filter === "all" ? assessments :
    filter === "critical" ? assessments.filter((a) => a.level === "critical") :
    assessments.filter((a) => a.level === "critical" || a.level === "high");

  const counts = {
    critical: assessments.filter((a) => a.level === "critical").length,
    high: assessments.filter((a) => a.level === "high").length,
    moderate: assessments.filter((a) => a.level === "moderate").length,
    low: assessments.filter((a) => a.level === "low").length,
  };

  const levelConfig = {
    critical: { color: "text-red-500", bg: "border-red-300 dark:border-red-900", label: "Критический", icon: AlertTriangle },
    high: { color: "text-orange-500", bg: "border-orange-300 dark:border-orange-900", label: "Высокий", icon: AlertTriangle },
    moderate: { color: "text-yellow-500", bg: "border-yellow-300 dark:border-yellow-900", label: "Умеренный", icon: ShieldCheck },
    low: { color: "text-green-500", bg: "", label: "Безопасно", icon: ShieldCheck },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-primary" />
            Монитор предприятий
          </DialogTitle>
          <DialogDescription>
            Риск-анализ: расстояние от вспышек до {enterprises.length} крупных предприятий.
            Время доставки скотовоза рассчитано при средней скорости 55 км/ч.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
            Все ({assessments.length})
          </Button>
          <Button size="sm" variant={filter === "critical" ? "default" : "outline"} onClick={() => setFilter("critical")}
            className={counts.critical > 0 ? "border-red-300" : ""}>
            🔴 Критично ({counts.critical})
          </Button>
          <Button size="sm" variant={filter === "high" ? "default" : "outline"} onClick={() => setFilter("high")}
            className={counts.high > 0 ? "border-orange-300" : ""}>
            🟠 Высокий ({counts.high})
          </Button>
        </div>

        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {filtered.map((a) => {
            const cfg = levelConfig[a.level];
            const Icon = cfg.icon;
            return (
              <Card key={a.enterprise.id} className={`p-3 ${cfg.bg}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm flex items-center gap-1.5">
                      <span>{ENTERPRISE_ICONS[a.enterprise.type]}</span>
                      <span className="truncate">{a.enterprise.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {a.enterprise.region || "Регион не указан"}
                      <Badge variant="outline" className="ml-1 text-xs py-0">
                        {ENTERPRISE_LABELS[a.enterprise.type]}
                      </Badge>
                    </div>

                    {a.nearestOutbreak && (
                      <div className="text-xs mt-1.5 space-y-0.5">
                        <div className="text-muted-foreground">
                          Ближайшая вспышка: <span className="font-medium">{a.nearestOutbreak.disease}</span>
                          {" — "}{a.nearestOutbreak.region}
                        </div>
                        {a.transportRisk && (
                          <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                            <Truck className="h-3 w-3" />
                            Транспортный риск: {a.transportHops} пересадка по трассе
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className={`flex items-center gap-1 ${cfg.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                      <span className="font-bold text-sm">{cfg.label}</span>
                    </div>
                    {a.distanceKm !== null && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {a.distanceKm} км
                      </div>
                    )}
                    {a.arrivalHours !== null && a.level !== "low" && (
                      <div className="text-xs text-muted-foreground flex items-center gap-0.5 justify-end">
                        <Truck className="h-3 w-3" />
                        {a.arrivalHours < 1
                          ? `${Math.round(a.arrivalHours * 60)} мин`
                          : `${a.arrivalHours} ч`}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          {filtered.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              <ShieldCheck className="h-10 w-10 mx-auto mb-2 text-green-500" />
              Нет предприятий в зоне риска
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
