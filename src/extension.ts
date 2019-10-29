import * as path from "path";
import * as vscode from "vscode";
import {
  runMesonConfigure,
  runMesonTests,
  runMesonReconfigure
} from "./meson/runners";
import { MesonProjectExplorer } from "./treeview";
import {
  extensionConfiguration,
  workspaceRelative,
  extensionConfigurationSet,
  arrayIncludes
} from "./utils";
import MesonBuildDir from "./meson/BuildDir";
import MesonBuildTarget from "./meson/BuildTarget";
import { runNinja } from "./meson/utils";

let explorer: MesonProjectExplorer;

export function activate(ctx: vscode.ExtensionContext): void {
  const root = vscode.workspace.rootPath;
  const builder = new MesonBuildDir(root, workspaceRelative(extensionConfiguration("buildFolder")));
  if (!root) return;

  explorer = new MesonProjectExplorer(ctx, builder.buildDir);

  ctx.subscriptions.push(
    vscode.tasks.registerTaskProvider("meson", {
      async provideTasks() {
        const [tgts, tests, benches] = await Promise.all([builder.getTargets(), builder.getTests(), builder.getBenchmarks()]);
        return [
          ...tgts.map(t => t.getBuildTask()),
          ...tgts.map(t => t.getRunTask()),
          ...tests.map(t => t.getRunTask()),
          ...benches.map(t => t.getRunTask())
        ]
      },
      resolveTask() {
        return undefined;
      }
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.configure", async () => {
      await builder.configure();
      explorer.refresh();
    })
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.reconfigure", async () => {
      await builder.reconfigure();
      explorer.refresh();
    })
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "mesonbuild.build",
      async (name?: string) => {
        const resolvedTarget = await new Promise<MesonBuildTarget>((resolve, reject) => {
          if (name) {
            return resolve(MesonBuildTarget.fromTargetName(builder, name));
          }
          const itemsP: Promise<vscode.QuickPickItem[]> = builder.getTargets().then<vscode.QuickPickItem[]>(tt => [
            {
              label: "all",
              detail: "Build all targets",
              description: "(meta-target)",
              picked: true
            },
            ...tt.map<vscode.QuickPickItem>(t => ({
              label: t.name,
              detail: path.relative(root, path.dirname(t.target.defined_in)),
              description: t.type,
              picked: false
            }))
          ]);
          const picker = vscode.window.createQuickPick();
          picker.busy = true;
          picker.placeholder =
            "Select target to build. Defaults to all targets";
          picker.show();
          itemsP.then(items => {
            picker.items = items;
            picker.busy = false;
            picker.onDidAccept(async () => {
              const active = picker.activeItems[0];
              if (active.label === "all") resolve(undefined);
              else
                resolve(MesonBuildTarget.fromTargetName(builder, active.label));
              picker.dispose();
            });
            picker.onDidHide(() => reject());
          });
        }).catch<null>(() => null);
        if (resolvedTarget !== null)
          if (resolvedTarget === undefined) await builder.build();
          else resolvedTarget.build();
        await resolvedTarget.build();
        explorer.refresh();
      }
    )
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "mesonbuild.test",
      async (name?: string) => {
        const resolvedName = await new Promise<string>((resolve, reject) => {
          if (name) return resolve(name);
          const picker = vscode.window.createQuickPick();
          picker.busy = true;
          picker.onDidAccept(() => {
            const active = picker.activeItems[0];
            if (active.label === "all") resolve(undefined);
            else resolve(active.label);
            picker.dispose();
          });
          picker.onDidHide(() => reject());
          Promise.all([builder.getBenchmarks(), builder.getTests()])
            .then<vscode.QuickPickItem[]>(([benchmarks, tests]) => [
              {
                label: "all",
                detail: "Run all tests",
                description: "(meta-target)",
                picked: true
              },
              ...tests.map<vscode.QuickPickItem>(t => ({
                label: t.name,
                detail: `Test timeout: ${t.test.timeout}s, ${
                  t.test.is_parallel ? "Run in parallel" : "Run serially"
                  }`,
                description: t.test.suite.join(","),
                picked: false
              })),
              ...benchmarks.map<vscode.QuickPickItem>(b => ({
                label: b.name,
                detail: `Benchmark timeout: ${
                  b.test.timeout
                  }s, benchmarks always run serially`,
                description: b.test.suite.join(","),
                picked: false
              }))
            ])
            .then(items => {
              picker.busy = false;
              picker.items = items;
            });
          picker.show();
        }).catch<null>(() => null);
        if (resolvedName != null)
          await builder.test(resolvedName === "all" ? "" : resolvedName);
        explorer.refresh();
      }
    )
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.clean", async () => {
      await runNinja(["clean"], { cwd: builder.buildDir });
    })
  );

  if (extensionConfiguration("configureOnOpen"))
    vscode.commands
      .executeCommand("mesonbuild.configure")
      .then(() => {
        explorer.refresh();
      });
  else {
    vscode.window
      .showInformationMessage(
        "Meson project detected, would you like VS Code to configure it?",
        "Never",
        "Not this time",
        "This workspace",
        "Yes"
      )
      .then(response => {
        switch (response) {
          case "Yes":
            extensionConfigurationSet(
              "configureOnOpen",
              true,
              vscode.ConfigurationTarget.Global
            );
            break;
          case "This workspace":
            extensionConfigurationSet(
              "configureOnOpen",
              true,
              vscode.ConfigurationTarget.Workspace
            );
            break;
          case "Never":
            extensionConfigurationSet(
              "configureOnOpen",
              false,
              vscode.ConfigurationTarget.Global
            );
        }
        if (arrayIncludes(["Yes", "This workspace"], response)) {
          vscode.commands
            .executeCommand("mesonbuild.configure")
            .then(() => explorer.refresh());
        }
      });
  }
}
