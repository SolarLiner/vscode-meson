import { existsSync, exists } from "fs";
import { join } from "path";
import { ExecOptions } from "child_process";
import { exec, extensionConfiguration, execAsTask } from "../utils";
import { TaskExecution, TaskRevealKind, ShellExecution, ShellExecutionOptions } from "vscode";

// TODO: Check if this is the canonical way to check if Meson is configured
export async function checkMesonIsConfigured(dir: string) {
  return (await Promise.all([
    existsP(join(dir, "meson-info")),
    existsP(join(dir, "meson-private")),
    existsP(join(dir, "build.ninja"))
  ])).every(v => v);
}

export async function runMeson(args: string[], opts: ExecOptions) {
  const mesonPath = extensionConfiguration("mesonPath");
  const cmdLine = `${mesonPath} ${args.map(t => `${t}`).join(" ")}`;
  return exec(cmdLine, opts);
}

export async function runMesonTask(args: string[], opts: ShellExecutionOptions, reveal: TaskRevealKind) {
  const mesonPath = extensionConfiguration("mesonPath");
  const cmdLine = `${mesonPath} ${args.filter(Boolean).map(t => `"${t}"`).join(" ")}`;
  return execAsTask(cmdLine, opts, reveal);
}

export async function runNinja(args: string[], opts: ExecOptions) {
  const ninjaPath = extensionConfiguration("ninjaPath");
  const cmdLine = `${ninjaPath} ${args.filter(Boolean).map(t => `${t}`).join(" ")}`;
  return exec(cmdLine, opts);
}

export async function runNinjaTask(args: string[], opts: ShellExecutionOptions, reveal: TaskRevealKind) {
  const ninjaPath = extensionConfiguration("ninjaPath");
  const cmdLine = `${ninjaPath} ${args.filter(Boolean).map(t => `"${t}"`).join(" ")}`;
  return execAsTask(cmdLine, opts, reveal);
}

function existsP(path: string) {
  return new Promise<boolean>(res => {
    exists(path, res);
  });
}
