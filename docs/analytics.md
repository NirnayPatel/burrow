# Analytics

## Key takeaway

Burrow uses the same GA4 stream as `nirnaypatel.com`: `G-LXXGPP3DYD`. The marketing site records every interactive-control click, including the demo, with stable context fields.

## Events

| Event | Trigger | Parameters |
| --- | --- | --- |
| `marketing_click` | Interactive control on the marketing site | `click_label`, `click_type`, `page_path`, `page_section`, link fields |
| `demo_click` | Interactive control in `/demo/` | Marketing fields plus `demo_view` |

GA4's standard `page_view`, session, source, medium, and campaign collection remain enabled.

## GA4 setup

Register these event-scoped custom dimensions in GA4: `click_label`, `click_type`, `page_section`, `demo_view`, `link_domain`, `link_path`, `link_target`, and `outbound`.
