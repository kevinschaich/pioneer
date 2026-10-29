"""Convert world resource node positions into src/data/map-nodes.json.

Usage: python3 tools/build_map.py tools/sources/world-nodes.json > src/data/map-nodes.json
Source: https://github.com/rockfactory/satisfactory-logistics (MIT), src/recipes/WorldResourceNodes.json
"""
import json
import math
import sys

src = json.load(open(sys.argv[1]))
TYPES = {"node": "node", "deposit": None, "frackingCore": "well", "frackingSatellite": "satellite", "geyser": "geyser"}

cores = [n for n in src if n["nodeType"] == "frackingCore"]
out = []
for n in src:
    kind = TYPES[n["nodeType"]]
    if not kind:
        continue
    entry = {"id": n["id"], "kind": kind, "res": n["resource"], "purity": n["purity"], "x": round(n["x"]), "y": round(n["y"]), "z": round(n["z"])}
    if kind == "satellite":
        # Satellites aren't linked to their well in the source data; the nearest core is always theirs.
        core = min(cores, key=lambda c: math.hypot(c["x"] - n["x"], c["y"] - n["y"]))
        entry["well"] = core["id"]
    out.append(entry)
print(json.dumps(out, separators=(",", ":")))
