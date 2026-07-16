# Farm dashboard art manifest

The first dashboard pass uses inline SVG and CSS shapes so it ships without external image dependencies. Each illustration is isolated and can be replaced later without changing dashboard data or actions.

| Visual | Current source | Replacement boundary | Recommended final asset |
| --- | --- | --- | --- |
| Production barn | `BarnArtwork` in `FarmDashboard.jsx` | Replace the SVG returned by `BarnArtwork`; preserve its accessible label and the surrounding `barnButton` | Transparent SVG, 560 x 440 viewBox equivalent |
| Navigation signpost | `FarmSignpost` in `FarmDashboard.jsx` plus `.farmSignpost` rules | Replace the decorative wood treatment while preserving the three semantic buttons and their handlers | Layered SVG or CSS-backed transparent WebP, about 310 x 570 |
| Account cow | `CowArtwork` in `FarmDashboard.jsx` | Replace the SVG returned by `CowArtwork`; keep `skinIndex` support or replace it with a platform-to-asset map | Transparent SVG or WebP, about 500 x 360 |
| Clouds and hills | `.decorCloud`, `.farmHills`, and related rules in `FarmDashboard.css` | Replace individual decorative spans with background images while retaining `aria-hidden` | Repeatable SVG/WebP layers at 2x display size |
| Fence and grass | `.farmFence` and `.farmGround` in `FarmDashboard.css` | Replace CSS backgrounds only; no component changes needed | Repeatable transparent SVG/WebP texture |

Keep platform logos, if added, separate from cow artwork. That allows a connected account to change platform or branding without generating a new character asset.
