# Skill tree artwork

`jungle-skill-tree.webp` is the decorative 1672 × 941 skin used by
`css/skills.css` for the shared home / lobby / ingame `SkillPanel`.
It contains no text, skill tiles, progress bars or interactive controls.
All gameplay data and controls are live HTML/SVG, derived from the existing
shared skill rules. The layout preserves the artwork's 1672:941 aspect ratio,
is capped at 1672 px wide, and centers within wider/taller viewports. It scales
down uniformly to fit smaller windows. All skill tiles share one compact size;
single tiles center under their tier, and labels center in their allotted space.
Compact layouts reduce ornament before text.

## Browser regression check

Open the home skill preview, close it, then continue a saved solo expedition
without reloading the page. Open Skills with K. The HUD stylesheet may arrive
after the skill stylesheet in this route: tier gate SVGs must remain hidden,
the level emblem must remain 1.25 em square, and tier labels must stay inside
their compact header strips. Skill-specific SVG rules intentionally outrank
the generic `.hud svg` rule regardless of stylesheet order. Also check a
direct expedition start and a home-only preview.

Created with the built-in ImageGen tool on 2026-10-23 from the user's attached
skill-tree design reference. Encoded to WebP at quality 0.92 (450,364 bytes).
The original generated PNG remains in the local Codex generated-images folder;
the runtime only needs the WebP committed here.

Generation prompt:

> Use case: stylized-concept. Create a production game UI BACKGROUND SKIN, landscape 16:9, closely matching the user reference's hand-painted chunky carved stone dinosaur jungle skill tree menu. No text, no letters, no numbers, NO skill icons, NO skill tiles, NO buttons. Sunny lush prehistoric jungle background at outer edges, distant blue sky waterfall mountains and tiny long neck dinosaur in distant top right, framing dark green leaves. Layout is crucial: top 0%-20% has ivory parchment slab on left half, open jungle center and right. Three large empty dark stone panels from x=2%-34%,35%-66%,67%-98% and y=21%-86%, separated by narrow foliage. Left frame is irregular carved terracotta red rock with warm dark brown interior; center frame moss green carved rock dark green interior; right frame azure blue carved rock dark navy interior. Chunky bevelled chipped rock edges, foliage growing in seams, subtle fern silhouettes inside lower corners, subtle T rex / raptor / stegosaurus silhouette along bottoms of panels. Each panel has a blank brighter colored header band from y21%-28%, but otherwise EMPTY uninterrupted dark interior, absolutely no dividers/tiles/widgets. Bottom y87%-99% has long blank pale sandstone parchment slab x2%-73% and rocks/plants at right x74%-100%. High quality illustrated 3D mobile adventure art, tactile bevels, warm sunlight, bold rich colors, straight-on view, clean readable empty areas for HTML controls to be overlaid. The image is a decorative background, all readable text will be real HTML.
