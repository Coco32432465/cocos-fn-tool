using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using FortniteReplayReader;
using FortniteReplayReader.Models.NetFieldExports;
using Unreal.Core.Contracts;
using Unreal.Core.Models;
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
    var reader = new VitalsReader(ParseMode.Full);
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
    reader.Finish();
    byte[] raw = JsonSerializer.SerializeToUtf8Bytes(replay, options);

    if (full)
    {
        var fullPath = Path.ChangeExtension(outPath, ".full.json");
        File.WriteAllBytes(fullPath, raw);
        Console.WriteLine($"Rohdaten: {fullPath}");
    }

    using var doc = JsonDocument.Parse(raw, new JsonDocumentOptions { MaxDepth = 128 });
    Slim.Write(doc.RootElement, outPath, reader.Collected);

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

    public static void Write(JsonElement root, string outPath, Extras ex)
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

        // ---- Zusatzdaten: Leben/Schild, Inventar, Waffen (best effort, fehlt = leer) ----
        try { ex?.Write(w, t0, ownerId, ownerTeam, playerData); }
        catch (Exception e) { Console.WriteLine("Hinweis: Zusatzdaten konnten nicht geschrieben werden: " + e.Message); }

        w.WriteEndObject();
        w.Flush();
    }
}

// =====================================================================================================
//  Zusatzdaten aus dem Netzwerkstrom: Leben/Schild (HealthSet), Inventar (FortInventory), gehaltene Waffe
//  Alles in try/catch, damit der normale Export nie daran scheitert.
// =====================================================================================================
sealed class Extras
{
    public sealed class Hp { public double T; public float H, S; public float[] C; }
    public sealed class InvItem { public string Name; public int Count; public int Order; }
    public sealed class Snap { public double T; public List<InvItem> Items; }

    public readonly Dictionary<int, List<Hp>> Vitals = new();
    public readonly Dictionary<int, List<Snap>> Inv = new();
    public readonly Dictionary<uint, List<Snap>> OrphanInv = new();

    public string Info = "";
    public void Write(Utf8JsonWriter w, double t0, int ownerId, int ownerTeam, JsonElement playerData)
    {
        // Teammitglieder (fuer das Inventar, sonst wird die Datei zu gross)
        var team = new HashSet<int>();
        if (ownerId >= 0) team.Add(ownerId);
        if (ownerTeam >= 0 && playerData.ValueKind == JsonValueKind.Array)
            foreach (var p in playerData.EnumerateArray())
                if (p.ValueKind == JsonValueKind.Object && p.TryGetProperty("TeamIndex", out var ti) && ti.ValueKind == JsonValueKind.Number
                    && ti.TryGetInt32(out var tix) && tix == ownerTeam && p.TryGetProperty("Id", out var idv) && idv.TryGetInt32(out var pid)) team.Add(pid);

        w.WriteString("vitalsInfo", Info);
        // --- Leben / Schild: pro Spieler [t, hp, schild] ---
        w.WriteStartObject("vitals");
        foreach (var kv in Vitals)
        {
            if (kv.Value.Count == 0) continue;
            w.WriteStartArray(kv.Key.ToString());
            double last = double.MinValue;
            foreach (var h in kv.Value.OrderBy(x => x.T))
            {
                double t = Math.Round(h.T - t0, 1);
                if (t < -5 || t - last < 1.0) continue;
                last = t;
                w.WriteStartArray(); w.WriteNumberValue(t); w.WriteNumberValue(Math.Round(h.H)); w.WriteNumberValue(Math.Round(h.S)); w.WriteEndArray();
            }
            w.WriteEndArray();
        }
        w.WriteEndObject();

        // Inventare ohne Spieler-Zuordnung gehoeren (replays nehmen nur das eigene Inventar auf) dem Replay-Besitzer
        if (ownerId >= 0 && OrphanInv.Count > 0)
        {
            var best = OrphanInv.OrderByDescending(kv => kv.Value.Count).First();
            if (!Inv.ContainsKey(ownerId)) Inv[ownerId] = best.Value;
        }

        // --- Inventar (nur dein Team): Namenstabelle + pro Spieler [t, [[nameIdx, anzahl], ...]] ---
        var names = new List<string>(); var nameIdx = new Dictionary<string, int>();
        int N(string n) { if (!nameIdx.TryGetValue(n, out var i)) { i = names.Count; names.Add(n); nameIdx[n] = i; } return i; }
        w.WriteStartObject("inv");
        w.WriteStartObject("p");
        foreach (var kv in Inv)
        {
            if (!team.Contains(kv.Key) || kv.Value.Count == 0) continue;
            w.WriteStartArray(kv.Key.ToString());
            double last = double.MinValue;
            foreach (var sn in kv.Value.OrderBy(x => x.T))
            {
                double t = Math.Round(sn.T - t0, 1);
                if (t < -5 || t - last < 1.5) continue;
                last = t;
                w.WriteStartArray(); w.WriteNumberValue(t); w.WriteStartArray();
                foreach (var it in sn.Items) { w.WriteStartArray(); w.WriteNumberValue(N(it.Name)); w.WriteNumberValue(it.Count); w.WriteEndArray(); }
                w.WriteEndArray(); w.WriteEndArray();
            }
            w.WriteEndArray();
        }
        w.WriteEndObject();
        w.WriteStartArray("names"); foreach (var n in names) w.WriteStringValue(n); w.WriteEndArray();
        w.WriteEndObject();
    }
}

sealed class VitalsReader : FortniteReplayReader.ReplayReader
{
    public readonly Extras Collected = new();

    public VitalsReader(ParseMode mode) : base(null, mode) { }

    double _now;
    readonly Dictionary<uint, uint> _actorToChannel = new();
    readonly Dictionary<uint, uint> _channelToActor = new();
    readonly Dictionary<uint, int> _stateToPlayer = new();
    readonly Dictionary<uint, uint> _pawnToStateGuid = new();

    sealed class HpState { public float H, S; public float[] C; public double LastT = double.MinValue; }
    sealed class InvState { public Dictionary<int, Extras.InvItem> Items = new(); public uint Pawn; public double LastT = double.MinValue; public bool Dirty; }
    readonly Dictionary<uint, HpState> _hp = new();
    readonly Dictionary<uint, InvState> _inv = new();

    // noch keinem Spieler zugeordnete Ereignisse (Kanal -> Liste)
    readonly List<(uint ch, Extras.Hp hp)> _pendHp = new();
    readonly List<(uint ch, Extras.Snap snap)> _pendInv = new();

    bool TryResolve(uint ch, out int pid)
    {
        if (_stateToPlayer.TryGetValue(ch, out pid)) return true;
        if (_pawnToStateGuid.TryGetValue(ch, out var sg) && _actorToChannel.TryGetValue(sg, out var sc) && _stateToPlayer.TryGetValue(sc, out pid)) return true;
        pid = -1;
        return false;
    }

    static List<T> L<T>(Dictionary<int, List<T>> d, int k) { if (!d.TryGetValue(k, out var l)) { l = new List<T>(); d[k] = l; } return l; }

    void Flush()
    {
        for (int i = _pendHp.Count - 1; i >= 0; i--) if (TryResolve(_pendHp[i].ch, out var pid)) { L(Collected.Vitals, pid).Add(_pendHp[i].hp); _pendHp.RemoveAt(i); }
        for (int i = _pendInv.Count - 1; i >= 0; i--) if (TryResolve(_pendInv[i].ch, out var pid)) { L(Collected.Inv, pid).Add(_pendInv[i].snap); _pendInv.RemoveAt(i); }
        if (_pendHp.Count > 20000) _pendHp.RemoveRange(0, _pendHp.Count - 20000);
        if (_pendInv.Count > 20000) _pendInv.RemoveRange(0, _pendInv.Count - 20000);
    }

    public void Finish()
    {
        try
        {
            Flush();
            int k = BestCandidate(out var handle);
            Collected.Info = k >= 0 ? "shield-handle=" + handle : "shield-handle=default";
            if (k >= 0) foreach (var l in Collected.Vitals.Values) foreach (var e in l) if (e.C != null && k < e.C.Length) e.S = e.C[k];
        }
        catch { }
    }

    protected override void OnChannelOpened(uint channelIndex, NetworkGUID? actor)
    {
        try { if (actor != null) { _actorToChannel[actor.Value] = channelIndex; _channelToActor[channelIndex] = actor.Value; } } catch { }
        base.OnChannelOpened(channelIndex, actor);
    }

    int _tick;
    protected override void OnExportRead(uint channelIndex, INetFieldExportGroup exportGroup)
    {
        try
        {
            switch (exportGroup)
            {
                case GameState gs:
                    if (gs.ReplicatedWorldTimeSecondsDouble is double dd && dd > 0) _now = dd;
                    else if (gs.ReplicatedWorldTimeSeconds is float ff && ff > 0) _now = ff;
                    break;
                case FortPlayerState ps:
                    if (ps.bOnlySpectator != true)
                    {
                        int? id = ps.PlayerId is null ? ps.PlayerID : (int?)ps.PlayerId;
                        if (id.HasValue) _stateToPlayer[channelIndex] = id.Value;
                    }
                    break;
                case PlayerPawn pw:
                    if (pw.PlayerState.HasValue) _pawnToStateGuid[channelIndex] = pw.PlayerState.Value;
                    break;
                case HealthSet hs:
                    OnHealth(channelIndex, hs);
                    break;
            }
            if ((++_tick & 0x3FF) == 0) Flush();
        }
        catch { }
        base.OnExportRead(channelIndex, exportGroup);
    }

    void OnHealth(uint ch, HealthSet h)
    {
        if (_now <= 0) return;
        var v = new float?[] { h.V0,h.V1,h.V2,h.V3,h.V4,h.V5,h.V6,h.V7,h.V8,h.V9,h.V10,h.V11,h.V12,h.V13,h.V14,h.V15,h.V16,h.V17,h.V18,h.V19,h.V20,h.V21,h.V22,h.V23,h.V24,h.V25,h.V26,h.V27,h.V28,h.V29,
            h.V30,h.V31,h.V32,h.V33,h.V34,h.V35,h.V36,h.V37,h.V38,h.V39,h.V40,h.V41,h.V42,h.V43,h.V44,h.V45,h.V46,h.V47,h.V48,h.V49,h.V50,h.V51,h.V52,h.V53,h.V54,h.V55,h.V56,h.V57,h.V58,h.V59,
            h.V60,h.V61,h.V62,h.V63,h.V64,h.V65,h.V66,h.V67,h.V68,h.V69,h.V70,h.V71,h.V72,h.V73,h.V74,h.V75,h.V76,h.V77,h.V78,h.V79 };
        // Schild-Block-Kandidaten im ersten vollen Update: Basis/Aktuell leer, Max (b+3) = 100, b > 3
        if (_cand == null)
        {
            var c = new List<int>();
            for (int b = 4; b + 3 < v.Length; b++)
                if (v[b + 3] == 100f && (v[b] ?? 0f) == 0f && (v[b + 1] ?? 0f) == 0f) c.Add(b + 1);
            if (c.Count > 0) _cand = c.ToArray();
        }
        float?[] cv = null;
        if (_cand != null) { cv = new float?[_cand.Length]; for (int k = 0; k < _cand.Length; k++) { cv[k] = v[_cand[k]]; if (cv[k].HasValue) _candHits[k]++; } }
        float? hp = v[1], sh = v[19];
        if (hp == null && sh == null && (cv == null || !cv.Any(x => x.HasValue))) return;
        if (!_hp.TryGetValue(ch, out var s)) { s = new HpState(); _hp[ch] = s; }
        if (hp.HasValue) s.H = hp.Value;
        if (sh.HasValue) s.S = sh.Value;
        if (cv != null) { if (s.C == null) s.C = new float[cv.Length]; for (int k = 0; k < cv.Length; k++) if (cv[k].HasValue) s.C[k] = cv[k].Value; }
        if (_now - s.LastT < 0.5) return;
        s.LastT = _now;
        _pendHp.Add((ch, new Extras.Hp { T = _now, H = s.H, S = s.S, C = s.C == null ? null : (float[])s.C.Clone() }));
    }

    int[] _cand; readonly int[] _candHits = new int[64];
    public int BestCandidate(out int handle)
    {
        handle = 19;
        if (_cand == null) return -1;
        int best = -1, hits = 0;
        for (int k = 0; k < _cand.Length; k++) if (_candHits[k] > hits) { hits = _candHits[k]; best = k; }
        if (best >= 0) handle = _cand[best];
        return best;
    }

    protected override void OnNetDeltaRead(uint channelIndex, NetDeltaUpdate update)
    {
        try
        {
            if (update.Export is FortInventory inv)
            {
                if (!_inv.TryGetValue(channelIndex, out var st)) { st = new InvState(); _inv[channelIndex] = st; }
                if (!st.Items.TryGetValue(update.ElementIndex, out var it)) { it = new Extras.InvItem(); st.Items[update.ElementIndex] = it; }
                var nm = inv.ItemDefinition?.Name;
                if (!string.IsNullOrEmpty(nm)) it.Name = nm;
                if (inv.Count.HasValue) it.Count = inv.Count.Value;
                if (inv.OrderIndex.HasValue) it.Order = inv.OrderIndex.Value;
                if (inv.ReplayPawn.HasValue && inv.ReplayPawn.Value > 0) st.Pawn = inv.ReplayPawn.Value;
                st.Dirty = true;
                SnapInv(channelIndex, st);
            }
            else if (update.Export == null && _inv.TryGetValue(channelIndex, out var st2))
            {
                st2.Items.Remove(update.ElementIndex);
                st2.Dirty = true;
                SnapInv(channelIndex, st2);
            }
        }
        catch { }
        base.OnNetDeltaRead(channelIndex, update);
    }

    void SnapInv(uint ch, InvState st)
    {
        if (!st.Dirty || _now <= 0 || _now - st.LastT < 1.0) return;
        // Spieler ueber das Pawn des Inventars finden: Pawn-Actor -> Pawn-Kanal -> Spieler
        var items = st.Items.Values.Where(i => !string.IsNullOrEmpty(i.Name) && i.Count > 0).OrderBy(i => i.Order)
            .Select(i => new Extras.InvItem { Name = i.Name, Count = i.Count, Order = i.Order }).ToList();
        st.LastT = _now; st.Dirty = false;
        var snap = new Extras.Snap { T = _now, Items = items };
        if (st.Pawn != 0 && _actorToChannel.TryGetValue(st.Pawn, out var pawnCh)) _pendInv.Add((pawnCh, snap));
        else { if (!Collected.OrphanInv.TryGetValue(ch, out var ol)) { ol = new List<Extras.Snap>(); Collected.OrphanInv[ch] = ol; } ol.Add(snap); }
    }
}
