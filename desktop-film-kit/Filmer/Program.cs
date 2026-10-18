// Film a Windows desktop app, in step with a narration that already exists.
//
// WHY THIS IS A SEPARATE PROGRAM FROM THE WEB VERSION
//
// The web kit injects an overlay into the page and lets a browser engine
// record itself. A WPF window has no page to inject into and no engine to ask,
// so the work splits in three:
//
//   1. THIS program drives the app with Windows UI Automation and records
//      WHERE each control was on screen and WHEN it was pressed.
//   2. ffmpeg records the window the whole time, as raw footage.
//   3. assemble-desktop.js does the zooming, the ring and the captions
//      AFTERWARDS, using the coordinates this program wrote down.
//
// Doing the zoom in post rather than live is not a compromise. A desktop app
// cannot be zoomed without resizing it, which would change the layout being
// explained - and footage that was never zoomed can be re-cut to a different
// zoom later without re-filming.
//
// THE CONTRACT WITH THE REST OF THE KIT
//
//   reads   script.json          the scenes, in order
//           audio/timings.json   how long each spoken line actually takes
//   writes  out/raw.mp4          the untouched footage
//           out/shots.json       per scene: when it started, and the control's
//                                rectangle in the footage's own coordinates
//
// USAGE
//   dotnet run --project Filmer -- --app "C:\path\to\YourApp.exe" --film demo --lang en

using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.UIA3;

namespace Filmer;

internal static class Program
{
    // The same two numbers the web kit uses, and for the same reason: the
    // film is cut to the voice, so these must match what the narration was
    // budgeted with.
    private const double PauseSeconds = 1.4;

    // A still shot nobody is doing anything in. Over this, the film is dead
    // air and this refuses to make it - the same limit as the web kit,
    // learned the same way.
    private const double StillLimitSeconds = 20;

    private static string Arg(string[] args, string name, string? fallback = null)
    {
        var i = Array.IndexOf(args, "--" + name);
        if (i >= 0 && i + 1 < args.Length) return args[i + 1];
        return fallback ?? throw new ArgumentException($"--{name} is required");
    }

    private static int Main(string[] args)
    {
        try { return Run(args); }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"\nThe recording failed: {ex.Message}");
            return 1;
        }
    }

    private static int Run(string[] args)
    {
        var appPath = Arg(args, "app");
        var film = Arg(args, "film", "demo");
        var lang = Arg(args, "lang", "en");
        var root = Directory.GetCurrentDirectory();

        var script = JsonNode.Parse(File.ReadAllText(Path.Combine(root, "script.json")))!;
        var timingsPath = Path.Combine(root, "audio", "timings.json");
        if (!File.Exists(timingsPath))
            throw new FileNotFoundException(
                "No audio/timings.json. Run make-narration.js first - the film is cut to the " +
                "voice, so the voice has to exist before the camera starts.");
        var timings = JsonNode.Parse(File.ReadAllText(timingsPath))!;

        var scenes = script["films"]![film]!["scenes"]!.AsArray();
        double Seconds(JsonNode scene) =>
            timings[$"{film}-{lang}-{scene["id"]!.GetValue<string>()}"]?.GetValue<double>()
            ?? throw new InvalidOperationException(
                $"no measured narration for {film}-{lang}-{scene["id"]}");

        PreFlight(scenes, Seconds);

        var outDir = Path.Combine(root, "out");
        Directory.CreateDirectory(outDir);
        var rawPath = Path.Combine(outDir, "raw.mp4");

        Console.WriteLine($"Launching {appPath}");
        using var automation = new UIA3Automation();
        using var app = Application.Launch(appPath);
        var window = app.GetMainWindow(automation, TimeSpan.FromSeconds(30))
            ?? throw new InvalidOperationException("the app never showed a window");
        window.Focus();
        Thread.Sleep(2000);   // let it finish painting before the camera rolls

        var title = window.Title;
        Console.WriteLine($"Recording window: \"{title}\"");

        // ffmpeg records the WINDOW, not the whole desktop, so nothing else on
        // the machine ends up in the film - a stray notification in a video
        // sent to colleagues is the thing everybody notices.
        // Syntax read off ffmpeg.org/ffmpeg-devices.html on 2026-10-17.
        var ffmpeg = Process.Start(new ProcessStartInfo
        {
            FileName = "ffmpeg",
            ArgumentList = {
                "-y", "-f", "gdigrab", "-framerate", "25",
                "-i", $"title={title}",
                "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                rawPath,
            },
            RedirectStandardInput = true,
            RedirectStandardError = true,
        }) ?? throw new InvalidOperationException("ffmpeg would not start - is it on PATH?");

        Thread.Sleep(1500);   // let the capture settle before scene one
        var filmStarted = Stopwatch.StartNew();
        var shots = new JsonArray();
        var overruns = new List<string>();

        var windowRect = window.BoundingRectangle;

        foreach (var scene in scenes)
        {
            var id = scene!["id"]!.GetValue<string>();
            var budget = Seconds(scene) + PauseSeconds;
            var began = filmStarted.Elapsed.TotalSeconds;

            var target = scene["control"]?.GetValue<string>();
            Rectangle rect = Rectangle.Empty;

            if (target is not null)
            {
                var element = Find(window, target);
                // Rectangles are written RELATIVE TO THE WINDOW, because that
                // is what the footage contains. Screen coordinates would be
                // wrong the moment the window is not at the top left.
                var r = element.BoundingRectangle;
                rect = new Rectangle(
                    r.Left - windowRect.Left, r.Top - windowRect.Top, r.Width, r.Height);

                var action = scene["do"]?.GetValue<string>() ?? "hold";
                if (action != "hold")
                {
                    // A REAL cursor, moved slowly. gdigrab does capture the
                    // mouse pointer, so unlike the web kit nothing has to be
                    // drawn - but a pointer that teleports reads as a glitch,
                    // so it is moved in steps.
                    Mouse.MoveTo(new Point(r.Left + r.Width / 2, r.Top + r.Height / 2));
                    Thread.Sleep(500);
                    Perform(element, action);
                }
            }

            var used = filmStarted.Elapsed.TotalSeconds - began;
            var hold = budget - used;
            if (hold < 0) overruns.Add($"{id}: needs about {used + PauseSeconds:F1}s of speech, has {Seconds(scene):F1}s");

            shots.Add(new JsonObject
            {
                ["id"] = id,
                ["start"] = Math.Round(began, 3),
                ["seconds"] = Math.Round(budget, 3),
                ["rect"] = rect.IsEmpty ? null : new JsonObject
                {
                    ["x"] = rect.X, ["y"] = rect.Y,
                    ["w"] = rect.Width, ["h"] = rect.Height,
                },
            });

            Console.WriteLine($"  {id,-18}{used,6:F1}s acting, {Math.Max(hold, 0),5:F1}s holding");
            if (hold > 0) Thread.Sleep((int)(hold * 1000));
        }

        Thread.Sleep(800);
        // "q" on stdin is how ffmpeg is asked to finish the file properly.
        // Killing it leaves an unplayable mp4 with no moov atom.
        ffmpeg.StandardInput.Write("q");
        ffmpeg.StandardInput.Flush();
        if (!ffmpeg.WaitForExit(20000)) ffmpeg.Kill();

        File.WriteAllText(Path.Combine(outDir, "shots.json"),
            shots.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));

        app.Close();
        Console.WriteLine($"\nFilmed: {rawPath}");
        Console.WriteLine($"Shots:  {Path.Combine(outDir, "shots.json")}");

        if (overruns.Count > 0)
        {
            Console.WriteLine($"\n{overruns.Count} scene(s) overran their line:");
            foreach (var o in overruns) Console.WriteLine("  " + o);
            Console.WriteLine("Lengthen those lines in script.json. Do not speed up the camera - " +
                              "the actions are what the film is OF.");
        }
        return 0;
    }

    /// Refuse to film what nobody will watch. Both of these were learned on
    /// the web version by showing a film to a person, and both cost nothing
    /// to check before the camera rolls.
    private static void PreFlight(JsonArray scenes, Func<JsonNode, double> seconds)
    {
        var problems = new List<string>();

        // A zoom closer than 2x loses what is AROUND the control, and a
        // control is identified by its neighbours.
        foreach (var scene in scenes)
        {
            var zoom = scene!["zoomScale"]?.GetValue<double>();
            if (zoom is > 2.0)
                problems.Add($"{scene["id"]}: {zoom}x is closer than 2x - the viewer loses the context");
            if (scene["zoomScale"] is not null && scene["control"] is null)
                problems.Add($"{scene["id"]}: has a zoomScale but no control to zoom into");
        }

        // A run of shots where nothing happens is dead air.
        double run = 0;
        var ids = new List<string>();
        double worst = 0;
        var worstIds = new List<string>();
        foreach (var scene in scenes.Append(null))
        {
            var still = scene is not null &&
                        (scene["do"]?.GetValue<string>() ?? "hold") == "hold" &&
                        scene["zoomScale"] is null;
            if (still && scene is not null)
            {
                run += seconds(scene);
                ids.Add(scene["id"]!.GetValue<string>());
            }
            else
            {
                if (run > worst) { worst = run; worstIds = new List<string>(ids); }
                run = 0; ids.Clear();
            }
        }
        if (worst > StillLimitSeconds)
            problems.Add($"{worst:F0} seconds of still screen in a row ({string.Join(", ", worstIds)}) - " +
                         $"nobody watches a still picture being talked at for {StillLimitSeconds}s");

        if (problems.Count > 0)
            throw new InvalidOperationException(
                "this film would not be watchable:\n  " + string.Join("\n  ", problems));

        Console.WriteLine($"Pre-flight passed. Longest still stretch: {worst:F1}s " +
                          $"(limit {StillLimitSeconds}s).");
    }

    /// Find a control the way the script names it: "AutomationId" by default,
    /// or "name:Send" / "text:Send" to go by what the user sees.
    private static AutomationElement Find(Window window, string target)
    {
        var (how, what) = target.Contains(':')
            ? (target[..target.IndexOf(':')], target[(target.IndexOf(':') + 1)..])
            : ("id", target);

        var element = how switch
        {
            "id" => window.FindFirstDescendant(cf => cf.ByAutomationId(what)),
            "name" or "text" => window.FindFirstDescendant(cf => cf.ByName(what)),
            _ => throw new ArgumentException($"unknown way to find a control: \"{how}\""),
        };

        return element ?? throw new InvalidOperationException(
            $"no control matching \"{target}\". Open Accessibility Insights or FlaUInspect " +
            $"and read the real AutomationId off the app - guessing one is how a film ends up " +
            $"pressing the wrong thing.");
    }

    private static void Perform(AutomationElement element, string action)
    {
        var (verb, value) = action.Contains(':')
            ? (action[..action.IndexOf(':')], action[(action.IndexOf(':') + 1)..])
            : (action, "");

        switch (verb)
        {
            case "press":
                element.Click();
                break;

            case "type":
                element.Focus();
                // Typed at human speed. A field that fills instantly reads as
                // a recording played at the wrong rate.
                foreach (var ch in value)
                {
                    Keyboard.Type(ch.ToString());
                    Thread.Sleep(55);
                }
                break;

            case "select":
                var combo = element.AsComboBox();
                combo.Select(value);
                break;

            case "check":
                element.AsCheckBox().IsChecked = true;
                break;

            default:
                throw new ArgumentException(
                    $"script.json asks for an action nobody wrote: \"{action}\"");
        }
    }
}
