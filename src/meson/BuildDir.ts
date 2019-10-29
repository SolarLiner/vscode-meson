import { exists as _exists, readFile as _readFile } from "fs";
import { promisify } from "util";
import * as vscode from "vscode";
import { checkMesonIsConfigured, runMeson, runNinja, runNinjaTask } from "./utils";
import { join, resolve } from "path";
import { extensionConfiguration, exec, getOutputChannel, execStream, execAsTask } from "../utils";
import { Target, ProjectInfo, BuildOption, BuildOptions, Dependencies, Tests } from "./types";

const exists = promisify(_exists);
const readFile = promisify(_readFile)

export default class MesonBuildTarget {
  private buildDir: string;
  private sourceDir: string;

  constructor(sourceDir: string, buildDir: string) {
    this.buildDir = resolve(buildDir);
    this.sourceDir = resolve(sourceDir);
  }

  public async isConfigured(): Promise<boolean> {
    return checkMesonIsConfigured(this.buildDir);
  }

  public async configure(): Promise<void> {
    if (this.isConfigured()) {
      return this.reconfigure();
    }
    return vscode.window.withProgress({
      title: "Configuring",
      location: vscode.ProgressLocation.Window,
      cancellable: false
    }, async progress => {
      progress.report({
        message: "Configuring build"
      });
      const configureOpts = extensionConfiguration("configureOptions");
      configureOpts.push(this.buildDir);
      const { stdout, stderr } = await runMeson(configureOpts, { cwd: this.sourceDir })
      getOutputChannel().appendLine(stdout);
      getOutputChannel().appendLine(stderr);
      if (stderr.length > 0) getOutputChannel().show(true);
    })
  }

  public async reconfigure(): Promise<void> {
    return vscode.window.withProgress({
      title: "Reconfiguring",
      location: vscode.ProgressLocation.Window,
      cancellable: false
    }, async progress => {
      progress.report({
        message: "Reconfiguring build"
      });
      const configureOpts = extensionConfiguration("configureOptions");
      const { stdout, stderr } = await runNinja(configureOpts, { cwd: this.buildDir });
      getOutputChannel().appendLine(stdout);
      getOutputChannel().appendLine(stderr);
      if (stderr.length > 0) getOutputChannel().show(true);
    })
  }

  public async build(target = "all") {
    const stream = execStream(extensionConfiguration("ninjaPath"), { cwd: this.buildDir });

    return vscode.window.withProgress({
      title: target === "all" ? "Building project" : `Building ${target}`,
      location: vscode.ProgressLocation.Notification,
      cancellable: true
    }, async (progress, token) => {
      token.onCancellationRequested(() => stream.kill());
      let oldPercentage = 0;
      stream.onLine((msg, isError) => {
        const match = /^\[(\d+)\/(\d+)\] (.*)/g.exec(msg);
        if (match) {
          const percentage = (100 * parseInt(match[1])) / parseInt(match[2]);
          const increment = percentage - oldPercentage;
          oldPercentage = percentage;
          if (increment > 0) progress.report({ increment, message: match[3] });
        }
        getOutputChannel().append(msg);
        if (isError) getOutputChannel().show(true);
      });
      await stream.finishP().then(code => {
        if (code !== 0) {
          getOutputChannel().show(false);
          throw new Error("Build failed. See Meson Build output for more details.");
        }
      });
      progress.report({ message: "Build finished.", increment: 100 });
      await new Promise(res => setTimeout(res, 3000));
    });
  }

  public async test(target = "") {
    try {
      return await runNinjaTask(["test", target], { cwd: this.buildDir }, vscode.TaskRevealKind.Always);
    } catch (e) {
      if (e.stderr) {
        vscode.window.showErrorMessage("Tests failed.");
        getOutputChannel().appendLine(e.stderr);
      }
    }
  }

  public async getTargets(): Promise<Target[]> {
    return this.getIntrospection<Target[]>("targets");
  }

  public async getProjectInfo(): Promise<ProjectInfo> {
    return this.getIntrospection<ProjectInfo>("projectinfo");
  }

  public async getBuildOptions(): Promise<BuildOptions> {
    return this.getIntrospection<BuildOptions>("buildoptions");
  }

  public async getDependencies(): Promise<Dependencies> {
    return this.getIntrospection<Dependencies>("dependencies");
  }

  public async getTests(): Promise<Tests> {
    return this.getIntrospection<Tests>("tests");
  }

  public async getBenchmarks(): Promise<Tests> {
    return this.getIntrospection<Tests>("benchmarks");
  }

  private async getIntrospection<K>(name: string): Promise<K | null> {
    if (!this.isConfigured()) return null;
    const fullPath = join(this.buildDir, `intro-${name == "project-info" ? "projectinfo" : name}.json`);
    if (await exists(fullPath)) {
      const b = await readFile(fullPath);
      return JSON.parse(b.toString());
    } else {
      const { stdout } = await runMeson(["instrospect", `--${name == "projectinfo" ? "project-info" : name}`], { cwd: this.buildDir });
      return JSON.parse(stdout);
    }
  }
}
