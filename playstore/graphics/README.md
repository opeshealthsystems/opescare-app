# Store graphics

## Ready

| File | Spec | Status |
| --- | --- | --- |
| `store-icon-512.png` | 512 × 512 PNG, 32-bit, under 1 MB | **Done** — 329 KB, downscaled from `assets/icon.png` with Lanczos. |

The source `assets/icon.png` is 1024 × 1024 and **1051 KB**, so it fails Play's
1 MB ceiling as well as being the wrong size. Use the 512 export here, not the
source asset.

## Still needed — these require a person

| Asset | Spec | Notes |
| --- | --- | --- |
| **Feature graphic** | 1024 × 500 PNG or JPEG, no alpha | Shown at the top of the listing and in some Play surfaces. It is a designed banner, not a screenshot — brand navy `#0F4C81`, the wordmark, and a short line. Play will not publish the listing without it. |
| **Phone screenshots** | 2–8 images, 16:9 or 9:16, each side 320–3840 px | The minimum is two. Capture from a real build on a real device. |
| **7-inch tablet screenshots** | Optional | Only if you declare tablet support. |
| **10-inch tablet screenshots** | Optional | Same. |

### Screenshots worth capturing

In this order — it tells the story the description tells, and each is a screen
that already looks finished:

1. **Health ID card** — the credential, in Presentation Mode. The most
   distinctive thing the app has.
2. **Care Map** — the directory with facilities and distance, showing the
   reported-availability timestamp.
3. **Health Passport** — a page carrying real record content.
4. **Consent request** — the moment a clinician asks and the patient decides.
   This is the product's argument in one screen.
5. **Access log** — every access listed afterwards, which is the promise the
   consent screen makes.
6. **Document download** — a laboratory report with its verification QR.

Capture in **both English and French** if you publish both listings; Play
holds a separate screenshot set per language and falls back to the default
otherwise.

### Two things to check before uploading any screenshot

- **No real patient data.** Use the demo accounts. A screenshot of a genuine
  record on a public store listing is a disclosure, and it is permanent.
- **No demo-mode banner** if the build you capture from shows one; a reviewer
  reading "demo" on a store screenshot will ask what they are looking at.
