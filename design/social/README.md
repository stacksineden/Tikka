# Tikka social kit

Social and teaser images built from the logo files in `design/logos/`, placed as they are (never redrawn, recoloured or distorted). Colours from `design/tokens.css` only; gold appears only inside the logo. Text is Bricolage Grotesque, with Space Mono for small labels. `contact-sheet.png` shows everything at once, with circle-crop and safe-area overlays.

| File | Size | Where it's used |
| --- | --- | --- |
| `tikka-profile.png` | 1080×1080 | Profile photo for @usetikka (Instagram, TikTok, WhatsApp). The reversed mark on night; everything sits inside the circle crop with more than 12% padding. |
| `tikka-profile-400.png` | 400×400 | The same, for X. |
| `tikka-studio-profile.png` | 1080×1080 | Profile photo for @tikkastudio: the reversed mark on night with "studio" under it, inside the circle crop. |
| `tikka-studio-profile-400.png` | 400×400 | The same, for X. |
| `tikka-studio-lockup.svg` | vector | New "tikka studio" lockup, light (ink): the existing wordmark plus "studio" in Bricolage Grotesque Medium, as outlines. For light grounds. |
| `tikka-studio-lockup.png` | 2000×311 | The same, transparent background. |
| `tikka-studio-lockup-reversed.svg` | vector | Reversed version (the wordmark's own on-night white) for night or dark grounds, as outlines. |
| `tikka-studio-lockup-reversed.png` | 2000×311 | The same, transparent background. |
| `tikka-x-header.png` | 1500×500 | X header for @usetikka: the reversed lockup and "Your ticket to something good." The bottom-left corner is kept clear for the profile photo. |
| `tikka-studio-x-header.png` | 1500×500 | X header for @tikkastudio: the reversed studio lockup and "Websites, WhatsApp automations and ads that turn attention into customers." |
| `teaser-status.png` | 1080×1920 | Founder's WhatsApp status: "Something good is coming." · November 2026 · usetikka.com. The top and bottom 250px hold nothing important. |
| `teaser-alt.png` | 1080×1920 | Second status option: "Your ticket to something good. Coming soon." |
| `teaser-square.png` | 1080×1080 | The teaser for posts and chats. |
| `teaser-status.mp4` | 1080×1920, 7s | Animated status: the lockup rises in with a slight overshoot, one soft shine, then the text fades in and holds. H.264, 30fps, 0.8 MB. |
| `highlight-about.png`, `highlight-drops.png`, `highlight-work.png`, `highlight-contact.png` | 1080×1920 | Instagram story highlight covers: the mark centred, with the label under it in Space Mono. |
| `contact-sheet.png` | 1800×2567 | Review sheet of every file above (not for posting). |

Notes:
- **Gap in the lockup:** the gap between "tikka" and "studio" is the width of the "k" in "studio" (465 units at a 1,000-unit em). The two words share a baseline.
- **How they were made:** rendered with Chrome through Playwright from HTML, with the fonts loaded from local files. The video frames were encoded with macOS AVFoundation (H.264), because ffmpeg isn't installed.
