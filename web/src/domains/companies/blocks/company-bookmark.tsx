"use client";

import { BookmarkButton } from "@/components/bookmark";
import {
  type CompanySearchMeta,
  useCompaniesStore,
} from "@/domains/companies/stores/companies";

type CompanyBookmarkProps = {
  company: CompanySearchMeta;
};

export function CompanyBookmark({ company }: CompanyBookmarkProps) {
  const selected = useCompaniesStore((s) => s.isBookmarked(company.permId));
  const addBookmark = useCompaniesStore((s) => s.addBookmark);
  const removeBookmark = useCompaniesStore((s) => s.removeBookmark);

  return (
    <BookmarkButton
      selected={selected}
      bookmark={() => addBookmark(company)}
      clearBookmark={() => removeBookmark(company.permId)}
    />
  );
}
