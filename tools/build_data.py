"""Convert SatisfactoryTools' data1.0.json into src/data/game.json for the app.

Usage: python3 tools/build_data.py path/to/data1.0.json > src/data/game.json
Source: https://raw.githubusercontent.com/greeny/SatisfactoryTools/master/data/data1.0.json
"""
import json
import sys

src = json.load(open(sys.argv[1]))
items, buildings = src["items"], src["buildings"]

recipes = []
used = set()
machines = {}
for r in src["recipes"].values():
    if not r["inMachine"] or not r["producedIn"] or r["forBuilding"]:
        continue
    bld = r["producedIn"][0]
    meta = buildings[bld]["metadata"]
    power = (r["minPower"] + r["maxPower"]) / 2 if r["isVariablePower"] else meta["powerConsumption"]
    machines[bld] = {"name": buildings[bld]["name"], "icon": buildings[bld]["icon"]}

    def conv(lst):
        out = []
        for x in lst:
            used.add(x["item"])
            amt = x["amount"]
            out.append([x["item"], round(amt, 4)])
        return out

    recipes.append({
        "id": r["className"],
        "name": r["name"],
        "alt": r["alternate"],
        "time": r["time"],
        "in": conv(r["ingredients"]),
        "out": conv(r["products"]),
        "m": bld,
        "power": power,
    })

used.update(src["resources"])
# Resource Well Extractors sit on well satellites; the Pressurizer (FrackingSmasher) caps the well.
machines["Desc_FrackingExtractor_C"] = {"name": buildings["Desc_FrackingExtractor_C"]["name"], "icon": buildings["Desc_FrackingExtractor_C"]["icon"]}
# Extractors aren't recipe machines but the graph shows them on resource nodes.
for ext in ["Desc_MinerMk1_C", "Desc_MinerMk2_C", "Desc_MinerMk3_C", "Desc_OilPump_C", "Desc_WaterPump_C", "Desc_FrackingSmasher_C"]:
    machines[ext] = {"name": buildings[ext]["name"], "icon": buildings[ext]["icon"]}
# Construction cost of every building the planner places, for the build-cost summary.
build_cost = {}
for r in src["recipes"].values():
    if r["forBuilding"] and r["products"] and r["products"][0]["item"] in machines:
        build_cost[r["products"][0]["item"]] = [[x["item"], x["amount"]] for x in r["ingredients"]]
        used.update(x["item"] for x in r["ingredients"])

# Power generators and what they burn: MW at 100%, water per MW, and each fuel's energy (MJ per item or m³).
generators = {}
for cls, g in src["generators"].items():
    b = buildings[cls]
    machines[cls] = {"name": b["name"], "icon": b["icon"]}
    generators[cls] = {"mw": g["powerProduction"], "water": g["waterToPowerRatio"],
                       "fuels": {f: items[f]["energyValue"] for f in g["fuel"]}}
    used.update(g["fuel"])
for r in src["recipes"].values():
    if r["forBuilding"] and r["products"] and r["products"][0]["item"] in generators:
        build_cost[r["products"][0]["item"]] = [[x["item"], x["amount"]] for x in r["ingredients"]]
        used.update(x["item"] for x in r["ingredients"])

out = {
    "items": {k: {"name": items[k]["name"], "liquid": items[k]["liquid"], "icon": items[k]["icon"]}
              for k in sorted(used)},
    "resources": list(src["resources"]),
    "machines": machines,
    "buildCost": build_cost,
    "generators": generators,
    "recipes": sorted(recipes, key=lambda r: (r["alt"], r["name"])),
}
print(json.dumps(out, separators=(",", ":")))
