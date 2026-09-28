-- MAIRO runs Meta only, and the plans were repriced ($49 / $99 / $199) with
-- new limits. PlanConfig rows override the plans compiled into the code, so
-- rows seeded under the old pricing would keep charging-page prices and
-- limits that no longer exist. Clearing them lets the code defaults apply;
-- `npm run db:seed` re-creates them from the new plans if they are wanted.
DELETE FROM "PlanConfig";
