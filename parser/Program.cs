using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using FortniteReplayReader;
using Unreal.Core.Models.Enums;

// Aufruf: ReplayDump <datei.replay> [ausgabe.json] [--full]
//   Standard: schlanke JSON (Format "cft-1") mit Spielern, Kills, Zonen, Bewegungsspuren
//   --full  : zusätzlich die komplette Rohdaten-JSON (sehr groß) neben die Ausgabe schreiben

var positional = args.Where(a => !a.StartsWith("--")).ToArray();
bool full = args.Contains("--full");

if (positional.Length == 0 || !File.Exists(positional[0]))
{
    Console.WriteLine("Aufruf: ReplayDump \"C:\\Pfad\\zur\\datei.replay\" [ausgabe.json] [--full]");
    Environment.ExitCode = 1;
    return;
}

var path = positional[0];
var outPath = positional.Length > 1 ? positional[1] : Path.ChangeExtension(path, ".json");

try
{
    Console.WriteLine("Lese Replay, das kann ein paar Minuten dauern ...");
    var reader = new ReplayReader(null, ParseMode.Full);
    var replay = reader.ReadReplay(path);

    var options = new JsonSerializerOptions
    {
        ReferenceHandler = ReferenceHandler.IgnoreCycles,
        NumberHandling = JsonNumberHandling.AllowNamedFloatingPointLiterals,
        IncludeFields = true,
        MaxDepth = 64
    };

    // Rohdaten einmal serialisieren und danach nur lesend nach Eigenschaftsnamen auswerten.
    // So hängt der Export nicht an den internen Klassen der Replay-Bibliothek.
    byte[] raw = JsonSerializer.SerializeToUtf8Bytes(replay, options);

    if (full)
    {
        var fullPath = Path.ChangeExtension(outPath, ".full.json");
        File.WriteAllBytes(fullPath, raw);
        Console.WriteLine($"Rohdaten: {fullPath}");
    }

    using var doc = JsonDocument.Parse(raw, new JsonDocumentOptions { MaxDepth = 128 });
    Slim.Write(doc.RootElement, outPath);

    Console.WriteLine($"Fertig: {outPath} ({new FileInfo(outPath).Length / 1024} KB)");
}
catch (Exception ex)
{
    Console.WriteLine("FEHLER beim Lesen:");
    Console.WriteLine(ex.ToString());
    Environment.ExitCode = 1;
}

static class Slim
{
    // ---- Hilfsfunktionen: fehlende/null/NaN-Werte werden zu Standardwerten ----
    static bool Get(JsonElement e, string name, out JsonElement v)
    {
        v = default;
        return e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out v) && v.ValueKind != JsonValueKind.Null;
    }
    static double D(JsonElement e, string name, double def = 0)
    {
        if (Get(e, name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var d) && double.IsFinite(d)) return d;
        return def;
    }
    static int I(JsonElement e, string name, int def = -1)
    {
        if (Get(e, name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var d) && double.IsFinite(d)) return (int)d;
        return def;
    }
    static string S(JsonElement e, string name, string def = "")
    {
        if (Get(e, name, out var v) && v.ValueKind == JsonValueKind.String) return v.GetString() ?? def;
        return def;
    }
    static bool B(JsonElement e, string name) => Get(e, name, out var v) && v.ValueKind == JsonValueKind.True;
    static bool HasNum(JsonElement e, string name) => Get(e, name, out var v) && v.ValueKind == JsonValueKind.Number;

    // Weltzeit eines Eintrags: bevorzugt das Double-Feld, sonst das Float-Feld (je nach Replay-Version ist nur eins gefuellt).
    static double TimeOf(JsonElement e, string dbl, string flt)
    {
        double d = D(e, dbl, 0);
        if (d > 0) return d;
        return D(e, flt, 0);
    }

    static double R1(double v) => Math.Round(v, 1);
    static long L(double v) => (long)Math.Round(v);

    static readonly string[] FlagNames =
    {
        "bIsSkydivingFromBus", "bIsSkydiving", "bIsSprinting", "bIsCrouched",
        "bIsDBNO", "bIsInAnyStorm", "bIsParachuteOpen", "bIsJumping"
    };

    public static void Write(JsonElement root, string outPath)
    {
        Get(root, "PlayerData", out var playerData);
        Get(root, "KillFeed", out var killFeed);
        Get(root, "TeamData", out var teamData);
        Get(root, "MapData", out var mapData);
        Get(root, "GameData", out var gameData);
        Get(root, "Stats", out var stats);
        Get(root, "Info", out var info);
        Get(root, "Header", out var header);

        // Besitzer des Replays (= du) und Nullpunkt der Zeitachse
        int ownerId = -1;
        string ownerName = "";
        int ownerTeam = -1, ownerPlacement = -1;
        double t0 = double.NaN;
        if (playerData.ValueKind == JsonValueKind.Array)
        {
            foreach (var p in playerData.EnumerateArray())
            {
                if (!B(p, "IsReplayOwner")) continue;
                ownerId = I(p, "Id");
                ownerName = S(p, "PlayerName");
                ownerTeam = I(p, "TeamIndex");
                ownerPlacement = I(p, "Placement");
                if (Get(p, "Locations", out var locs) && locs.ValueKind == JsonValueKind.Array)
                {
                    foreach (var l in locs.EnumerateArray())
                    {
                        double tv = TimeOf(l, "ReplicatedWorldTimeSecondsDouble", "ReplicatedWorldTimeSeconds");
                        if (tv > 0) { t0 = tv; break; }
                    }
                }
                break;
            }

            // Kein Replay-Besitzer gefunden: frueheste Position aller Spieler als Nullpunkt
            if (double.IsNaN(t0))
            {
                foreach (var p in playerData.EnumerateArray())
                {
                    if (!Get(p, "Locations", out var locs) || locs.ValueKind != JsonValueKind.Array) continue;
                    foreach (var l in locs.EnumerateArray())
                    {
                        double tv = TimeOf(l, "ReplicatedWorldTimeSecondsDouble", "ReplicatedWorldTimeSeconds");
                        if (tv > 0) { if (double.IsNaN(t0) || tv < t0) t0 = tv; break; }
                    }
                }
            }
        }
        if (double.IsNaN(t0)) t0 = 0;

        using var fs = File.Create(outPath);
        using var w = new Utf8JsonWriter(fs);
        w.WriteStartObject();
        w.WriteString("format", "cft-1");

        // ---- meta ----
        w.WriteStartObject("meta");
        w.WriteString("playlist", S(gameData, "CurrentPlaylist"));
        w.WriteString("startedUtc", S(gameData, "UtcTimeStartedMatch"));
        w.WriteString("build", S(header, "Branch"));
        w.WriteNumber("lengthSec", R1(D(info, "LengthInMs") / 1000.0));
        w.WriteNumber("t0", R1(t0));
        w.WriteNumber("ownerId", ownerId);
        w.WriteString("ownerName", ownerName);
        w.WriteNumber("ownerTeam", ownerTeam);
        w.WriteNumber("placement", ownerPlacement);
        w.WriteNumber("teamSize", I(gameData, "TeamSize"));
        w.WriteNumber("totalTeams", I(gameData, "TotalTeams"));
        w.WriteNumber("maxPlayers", I(gameData, "MaxPlayers"));
        w.WriteNumber("round", I(gameData, "TournamentRound", 0));
        w.WriteNumber("winningTeam", I(gameData, "WinningTeam"));
        if (HasNum(gameData, "AircraftStartTime")) w.WriteNumber("aircraftT", R1(D(gameData, "AircraftStartTime") - t0));
        if (HasNum(gameData, "SafeZonesStartTime")) w.WriteNumber("zonesT", R1(D(gameData, "SafeZonesStartTime") - t0));
        if (Get(mapData, "WorldGridStart", out var gs) && Get(mapData, "WorldGridEnd", out var ge))
        {
            w.WriteNumber("gridX0", D(gs, "X")); w.WriteNumber("gridY0", D(gs, "Y"));
            w.WriteNumber("gridX1", D(ge, "X")); w.WriteNumber("gridY1", D(ge, "Y"));
        }
        w.WriteEndObject();

        // ---- stats ----
        w.WriteStartObject("stats");
        foreach (var k in new[] { "Eliminations", "Assists", "Accuracy", "WeaponDamage", "OtherDamage", "DamageToPlayers",
                                  "DamageTaken", "DamageToStructures", "MaterialsGathered", "MaterialsUsed", "TotalTraveled", "Revives" })
            w.WriteNumber(k, D(stats, k));
        w.WriteEndObject();

        // ---- players ----
        w.WriteStartArray("players");
        if (playerData.ValueKind == JsonValueKind.Array)
        {
            foreach (var p in playerData.EnumerateArray())
            {
                int id = I(p, "Id");
                bool bot = B(p, "IsBot");
                string name = S(p, "PlayerName");
                if (name.Length == 0) name = S(p, "PlayerNameCustomOverride");
                if (name.Length == 0) name = S(p, "StreamerModeName");
                if (name.Length == 0) name = bot ? "Bot " + id : "Spieler " + id;
                w.WriteStartObject();
                w.WriteNumber("id", id);
                w.WriteString("name", name);
                w.WriteBoolean("bot", bot);
                w.WriteBoolean("owner", B(p, "IsReplayOwner"));
                w.WriteString("epic", S(p, "EpicId"));
                w.WriteNumber("team", I(p, "TeamIndex"));
                w.WriteNumber("placement", I(p, "Placement"));
                w.WriteNumber("kills", I(p, "Kills", 0));
                double dtv = TimeOf(p, "DeathTimeDouble", "DeathTime");
                if (dtv > 0) w.WriteNumber("deathT", R1(dtv - t0));
                if (Get(p, "DeathLocation", out var dl))
                {
                    w.WriteNumber("deathX", L(D(dl, "X")));
                    w.WriteNumber("deathY", L(D(dl, "Y")));
                }
                w.WriteEndObject();
            }
        }
        w.WriteEndArray();

        // ---- teams ----
        w.WriteStartArray("teams");
        if (teamData.ValueKind == JsonValueKind.Array)
        {
            foreach (var t in teamData.EnumerateArray())
            {
                w.WriteStartObject();
                w.WriteNumber("index", I(t, "TeamIndex"));
                w.WriteNumber("placement", I(t, "Placement"));
                w.WriteNumber("kills", I(t, "TeamKills", 0));
                w.WriteStartArray("ids");
                if (Get(t, "PlayerIds", out var pids) && pids.ValueKind == JsonValueKind.Array)
                    foreach (var pid in pids.EnumerateArray())
                        if (pid.ValueKind == JsonValueKind.Number && pid.TryGetInt32(out var pi)) w.WriteNumberValue(pi);
                w.WriteEndArray();
                w.WriteEndObject();
            }
        }
        w.WriteEndArray();

        // ---- kills (inkl. Knockdowns) ----
        w.WriteStartArray("kills");
        if (killFeed.ValueKind == JsonValueKind.Array)
        {
            foreach (var k in killFeed.EnumerateArray())
            {
                double kt = TimeOf(k, "ReplicatedWorldTimeSecondsDouble", "ReplicatedWorldTimeSeconds");
                if (kt <= 0) continue;
                w.WriteStartObject();
                w.WriteNumber("t", R1(kt - t0));
                w.WriteNumber("victim", I(k, "PlayerId"));
                w.WriteNumber("killer", I(k, "FinisherOrDowner"));
                w.WriteBoolean("down", B(k, "IsDowned"));
                w.WriteBoolean("revived", B(k, "IsRevived"));
                if (Get(k, "DeathLocation", out var dl))
                {
                    w.WriteNumber("x", L(D(dl, "X")));
                    w.WriteNumber("y", L(D(dl, "Y")));
                }
                w.WriteNumber("dist", R1(D(k, "Distance") / 100.0));
                w.WriteNumber("cause", I(k, "DeathCause"));
                w.WriteEndObject();
            }
        }
        w.WriteEndArray();

        // ---- zones ----
        w.WriteStartArray("zones");
        if (Get(mapData, "SafeZones", out var zones) && zones.ValueKind == JsonValueKind.Array)
        {
            foreach (var z in zones.EnumerateArray())
            {
                w.WriteStartObject();
                w.WriteNumber("r", D(z, "Radius"));
                w.WriteNumber("start", R1(D(z, "StartShrinkTime") - t0));
                w.WriteNumber("end", R1(D(z, "FinishShrinkTime") - t0));
                w.WriteNumber("nr", D(z, "NextRadius"));
                if (Get(z, "NextCenter", out var nc))
                {
                    w.WriteNumber("nx", L(D(nc, "X")));
                    w.WriteNumber("ny", L(D(nc, "Y")));
                }
                w.WriteNumber("lr", D(z, "LastRadius"));
                if (Get(z, "LastCenter", out var lc))
                {
                    w.WriteNumber("lx", L(D(lc, "X")));
                    w.WriteNumber("ly", L(D(lc, "Y")));
                }
                w.WriteEndObject();
            }
        }
        w.WriteEndArray();

        // ---- supply drops ----
        w.WriteStartArray("drops");
        if (Get(mapData, "SupplyDrops", out var drops) && drops.ValueKind == JsonValueKind.Array)
        {
            foreach (var s in drops.EnumerateArray())
            {
                if (!Get(s, "LandingLocation", out var ll)) continue;
                w.WriteStartObject();
                double bt = TimeOf(s, "BalloonPoppedTimeDouble", "BalloonPoppedTime");
                double lt = TimeOf(s, "LootedTimeDouble", "LootedTime");
                w.WriteNumber("t", bt > 0 ? R1(bt - t0) : -1);
                w.WriteNumber("x", L(D(ll, "X")));
                w.WriteNumber("y", L(D(ll, "Y")));
                w.WriteBoolean("looted", B(s, "Looted"));
                w.WriteNumber("lootedT", lt > 0 ? R1(lt - t0) : -1);
                w.WriteEndObject();
            }
        }
        w.WriteEndArray();

        // ---- tracks: pro Spieler [t, x, y, z, flags], auf ca. 1 Punkt pro Sekunde reduziert ----
        w.WriteStartObject("tracks");
        if (playerData.ValueKind == JsonValueKind.Array)
        {
            var seenIds = new HashSet<int>();
            foreach (var p in playerData.EnumerateArray())
            {
                if (I(p, "Id") < 0 || !seenIds.Add(I(p, "Id"))) continue;
                if (!Get(p, "Locations", out var locs) || locs.ValueKind != JsonValueKind.Array) continue;
                int count = locs.GetArrayLength();
                if (count == 0) continue;

                bool started = false;
                int idx = 0;
                double lastT = double.MinValue;
                foreach (var l in locs.EnumerateArray())
                {
                    idx++;
                    if (!Get(l, "ReplicatedMovement", out var mv) || !Get(mv, "Location", out var loc)) continue;
                    double tr = TimeOf(l, "ReplicatedWorldTimeSecondsDouble", "ReplicatedWorldTimeSeconds");
                    if (tr <= 0) continue;
                    double t = tr - t0;
                    if (t < lastT) continue;
                    if (started && t - lastT < 1.0 && idx != count) continue;

                    if (!started)
                    {
                        w.WriteStartArray(I(p, "Id").ToString());
                        started = true;
                    }
                    int flags = 0;
                    for (int i = 0; i < FlagNames.Length; i++)
                        if (B(l, FlagNames[i])) flags |= 1 << i;

                    w.WriteStartArray();
                    w.WriteNumberValue(R1(t));
                    w.WriteNumberValue(L(D(loc, "X")));
                    w.WriteNumberValue(L(D(loc, "Y")));
                    w.WriteNumberValue(L(D(loc, "Z")));
                    w.WriteNumberValue(flags);
                    w.WriteEndArray();
                    lastT = t;
                }
                if (started) w.WriteEndArray();
            }
        }
        w.WriteEndObject();

        w.WriteEndObject();
        w.Flush();
    }
}
