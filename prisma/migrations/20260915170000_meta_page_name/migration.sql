-- Cache the chosen Page's name so the dashboard can show which Page ads
-- go out as without a Graph call on every render. Nullable and additive: an
-- existing connection keeps working and fills this in the next time the Page
-- is chosen or the account reconnects.
ALTER TABLE "MetaAdAccount" ADD COLUMN "pageName" TEXT;
