# Analytics definitions

Every number in Mairo Assist is a count of rows that record something that
actually happened. Nothing is estimated, sampled, padded or back-filled. When
there isn't enough data, the dashboard says so.

Owner preview/test conversations (`conversations.channel = 'preview'`) are
never counted.

| Metric | Definition |
| --- | --- |
| Total conversations | Conversations started in the date range. |
| Unique customer conversations | Distinct identified customers among those conversations. Anonymous visitors aren't counted as unique customers. |
| AI resolution rate | `conversation_resolved_by_ai` events ÷ conversations started. A conversation counts only if it was resolved with no human reply. Shown as "—" when there are no conversations (never 0%). |
| Human escalation rate | `conversation_escalated` events ÷ conversations started. |
| Product recommendations | `product_recommended` events: a product card the AI actually showed. |
| Product link clicks | `product_link_clicked` events recorded by the widget. |
| Leads collected | `lead_captured` events. |
| Order requests handled | `order_lookup` events after successful verification. |
| Return / exchange requests | Requests created in the approval center. |
| AI-associated orders | `ai_attributed_order` events — see the rule below. |
| AI-associated revenue | Sum of the order totals of AI-associated orders, per currency. **Never** total store revenue. |
| AI usage | Model requests and tokens from `usage_records` / `usage_counters`. |

## Attribution rule for AI-associated orders

An order is **AI-associated** when all of these are true:

1. In a conversation, the AI showed a product card (`product_recommended`) for a
   product.
2. An order containing that product (any variant) was placed within **7 days**
   after that recommendation.
3. The order can be linked to the same shopper: the widget's cart attribute set
   during that conversation, or the verified customer of that conversation.

Each order is attributed at most once (`analytics_events.dedupe_key =
order:<id>`).

This measures **association, not causation**. The customer might have bought
anyway. The dashboard labels it "AI-associated" and never presents it as
incremental revenue or as the store's total revenue.
