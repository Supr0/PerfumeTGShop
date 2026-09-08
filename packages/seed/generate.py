"""Deterministic demo seed generator (R-01, R-02). Stdlib only.

Emits N products JSON matching the future API schema for rozliv (3/5/10 ml).
Deterministic: fixed seed (default 42); rerun-stable byte output.
"""
from __future__ import annotations

import argparse
import json
import random
import sys

DEFAULT_COUNT = 200
DEFAULT_SEED = 42

FAMILIES = (
    "fougere",
    "woody",
    "oriental",
    "citrus",
    "floral",
    "chypre",
    "gourmand",
    "leather",
    "marine",
)

GENDERS = ("M", "F", "uni")

SEASONS = ("spring", "summer", "autumn", "winter")

PLACE_TAGS = ("daily", "office", "evening", "date", "sport", "party", "travel")

BRANDS = (
    "Chanel",
    "Dior",
    "Guerlain",
    "Hermes",
    "Yves Saint Laurent",
    "Lancome",
    "Versace",
    "Armani",
    "Givenchy",
    "Kenzo",
    "Hugo Boss",
    "Calvin Klein",
    "Paco Rabanne",
    "Niche Atelier",
    "Bois Rare",
    "Oud House",
    "Citrus Lab",
    "Fleur Unique",
    "Cuir Nord",
    "Mare Blu",
)

NAME_ADJ = (
    "Noir", "Blanc", "Rouge", "Bleu", "Vert", "Ambre", "Oud",
    "Velours", "Soleil", "Lune", "Cuir", "Bois", "Fleur",
    "Musc", "Vetiver", "Neroli", "Santal", "Tabac", "Vanille", "Iris",
)

NAME_NOUN = (
    "Intense", "Elixir", "Essence", "Pour Homme", "Pour Femme",
    "Unisexe", "Extreme", "Legere", "Absolu", "Mystere",
)

TOP_NOTES = (
    "bergamot", "lemon", "grapefruit", "black pepper", "cardamom",
    "lavender", "marine accord", "apple", "ginger", "neroli",
)

HEART_NOTES = (
    "rose", "jasmine", "iris", "lavender", "geranium",
    "orange blossom", "sage", "violet", "cinnamon", "tobacco flower",
)

BASE_NOTES = (
    "cedar", "sandalwood", "vetiver", "musk", "amber",
    "tonka bean", "leather", "patchouli", "oakmoss", "vanilla",
)


def _pick(rng: random.Random, pool: tuple[str, ...] | list[str], k: int) -> list[str]:
    return rng.sample(list(pool), k)


def generate_products(count: int = DEFAULT_COUNT, seed: int = DEFAULT_SEED) -> list[dict]:
    """Generate ``count`` deterministic demo products."""
    if count < 0:
        raise ValueError("count must be >= 0")
    rng = random.Random(seed)
    products: list[dict] = []
    used_names: set[str] = set()
    for i in range(1, count + 1):
        pid = f"demo-{i:04d}"
        brand = rng.choice(BRANDS) + " (demo)"
        # Unique-ish name: brand-adj-noun + index fallback
        adj = rng.choice(NAME_ADJ)
        noun = rng.choice(NAME_NOUN)
        name = f"{adj} {noun} {i}"
        if name in used_names:  # pragma: no cover - safety, deterministic anyway
            name = f"{adj} {noun} {i:04d}"
        used_names.add(name)
        family = rng.choice(FAMILIES)
        gender = rng.choice(GENDERS)

        base_price = rng.randint(15000, 40000)  # minor units UAH (150-400 UAH / 3ml)
        price_5 = int(base_price * 1.5) + rng.randint(1000, 5000)
        price_10 = int(price_5 * 1.8) + rng.randint(2000, 8000)
        volumes = [
            {"ml": 3, "price_minor_UAH": base_price, "stock": rng.randint(0, 20)},
            {"ml": 5, "price_minor_UAH": price_5, "stock": rng.randint(0, 20)},
            {"ml": 10, "price_minor_UAH": price_10, "stock": rng.randint(0, 20)},
        ]

        top = _pick(rng, TOP_NOTES, 2)
        heart = _pick(rng, HEART_NOTES, 2)
        base = _pick(rng, BASE_NOTES, 2)
        description = {
            "uk": f"{name} — {family}, {gender}. Верхні ноти: {', '.join(top)}.",
            "ru": f"{name} — {family}, {gender}. Верхние ноты: {', '.join(top)}.",
        }
        season = sorted(_pick(rng, SEASONS, rng.randint(1, 2)))
        place_tags = sorted(_pick(rng, PLACE_TAGS, rng.randint(1, 2)))
        products.append(
            {
                "id": pid,
                "brand": brand,
                "name": name,
                "family": family,
                "gender": gender,
                "volumes": volumes,
                "description": description,
                "notes": {"top": top, "heart": heart, "base": base},
                "longevity": rng.randint(1, 5),
                "sillage": rng.randint(1, 5),
                "season": season,
                "place_tags": place_tags,
                "image": f"images/placeholder/{pid}.jpg",
            }
        )
    return products


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate deterministic demo products JSON.")
    parser.add_argument("--count", type=int, default=DEFAULT_COUNT)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--out", type=str, default=None, help="Output file; default stdout.")
    args = parser.parse_args(argv)
    if args.count < 0:
        parser.error("--count must be >= 0")
    products = generate_products(count=args.count, seed=args.seed)
    payload = json.dumps(products, sort_keys=True, ensure_ascii=False, indent=2)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(payload + "\n")
    else:
        sys.stdout.write(payload + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
