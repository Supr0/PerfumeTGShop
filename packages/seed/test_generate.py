"""RED tests for deterministic demo seed generator (R-01, R-02). stdlib only."""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate import generate_products, FAMILIES, GENDERS

SEED_DIR = Path(__file__).resolve().parent


def test_count_is_200():
    products = generate_products()
    assert len(products) == 200


def test_schema_keys_per_product():
    products = generate_products()
    required = {
        "id", "brand", "name", "family", "gender", "volumes",
        "description", "notes", "longevity", "sillage",
        "season", "place_tags", "image",
    }
    for p in products:
        assert required.issubset(p.keys()), f"missing keys in {p.get('id')}"
        assert p["brand"].endswith(" (demo)")
        assert p["family"] in FAMILIES
        assert p["gender"] in GENDERS
        assert set(p["description"].keys()) == {"uk", "ru"}
        assert set(p["notes"].keys()) == {"top", "heart", "base"}
        assert 1 <= p["longevity"] <= 5
        assert 1 <= p["sillage"] <= 5
        assert isinstance(p["season"], list) and len(p["season"]) >= 1
        assert isinstance(p["place_tags"], list) and len(p["place_tags"]) >= 1
        assert isinstance(p["image"], str) and len(p["image"]) > 0


def test_three_volumes_each():
    products = generate_products()
    for p in products:
        vols = p["volumes"]
        assert [v["ml"] for v in vols] == [3, 5, 10]
        for v in vols:
            assert isinstance(v["price_minor_UAH"], int) and v["price_minor_UAH"] > 0
            assert isinstance(v["stock"], int) and v["stock"] >= 0


def test_price_ordering():
    products = generate_products()
    for p in products:
        prices = [v["price_minor_UAH"] for v in p["volumes"]]
        assert prices[0] < prices[1] < prices[2], f"bad ordering in {p['id']}: {prices}"


def test_deterministic_bytes_across_runs():
    a = json.dumps(generate_products(), sort_keys=True, ensure_ascii=False).encode("utf-8")
    b = json.dumps(generate_products(), sort_keys=True, ensure_ascii=False).encode("utf-8")
    assert a == b

    with tempfile.TemporaryDirectory() as tmp:
        out1 = str(Path(tmp) / "a.json")
        out2 = str(Path(tmp) / "b.json")
        for out in (out1, out2):
            r = subprocess.run(
                [sys.executable, str(SEED_DIR / "generate.py"), "--out", out],
                capture_output=True, text=True, check=False,
            )
            assert r.returncode == 0, r.stderr
        assert Path(out1).read_bytes() == Path(out2).read_bytes()
