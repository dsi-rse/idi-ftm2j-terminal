"use client";

import { useEffect } from "react";

import {
  type CompanySearchMeta,
  useCompaniesStore,
} from "@/domains/companies/stores/companies";

type Props = {
  company: CompanySearchMeta;
};

export function RecentlyViewedTracker({ company }: Props) {
  const addRecentlyViewed = useCompaniesStore((s) => s.addRecentlyViewed);

  useEffect(() => {
    addRecentlyViewed(company);
    // Only record once per company visit; company object identity may change
    // across renders even though the permId is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addRecentlyViewed, company.permId]);

  return null;
}
