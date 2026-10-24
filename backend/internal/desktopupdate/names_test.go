package desktopupdate

import (
	"os"
	"path/filepath"
	"testing"
)

// 过渡期的核心承诺是“旧安装仍能升级、新包仍能识破同名”。
// 这组用例只验证名字探测与布局校验，不涉及真实替换。

func TestDetectWindowsExeNamePrefersFreshName(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{windowsExeName, legacyWindowsExe} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("MZ"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	got, err := detectWindowsExeName(root)
	if err != nil {
		t.Fatal(err)
	}
	if got != windowsExeName {
		t.Fatalf("detected %q, want %q", got, windowsExeName)
	}
}

func TestDetectWindowsExeNameFallsBackToLegacy(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, legacyWindowsExe), []byte("MZ"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := detectWindowsExeName(root)
	if err != nil {
		t.Fatal(err)
	}
	if got != legacyWindowsExe {
		t.Fatalf("detected %q, want %q", got, legacyWindowsExe)
	}
}

func TestDetectWindowsExeNameRejectsEmptyRoot(t *testing.T) {
	if _, err := detectWindowsExeName(t.TempDir()); err == nil {
		t.Fatal("empty directory accepted as an update payload")
	}
}

func TestDetectDarwinBundleNameFallsBackToLegacy(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, legacyAppBundleName), 0o755); err != nil {
		t.Fatal(err)
	}
	got, err := detectDarwinBundleName(root)
	if err != nil {
		t.Fatal(err)
	}
	if got != legacyAppBundleName {
		t.Fatalf("detected %q, want %q", got, legacyAppBundleName)
	}
}

func TestDetectLinuxBundleNameFallsBackToLegacy(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, legacyLinuxBundle), 0o755); err != nil {
		t.Fatal(err)
	}
	got, err := detectLinuxBundleName(root)
	if err != nil {
		t.Fatal(err)
	}
	if got != legacyLinuxBundle {
		t.Fatalf("detected %q, want %q", got, legacyLinuxBundle)
	}
}

// 旧包名的完整布局必须整包通过，否则存量用户会卡在“更新包无效”。
func TestValidateWindowsLayoutAcceptsLegacyExecutable(t *testing.T) {
	root := t.TempDir()
	if err := writeAgentLayout(filepath.Join(root, "agent-host"), "runtime/node.exe", "legacy"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, legacyWindowsExe), []byte("MZ-legacy"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, cliDirName), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, cliDirName, windowsCLIName), []byte("MZ-cli"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, pluginDirName), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, pluginDirName, "official.beeftv-plugin"), []byte("official"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := validateWindowsLayout(root); err != nil {
		t.Fatalf("legacy layout rejected: %v", err)
	}
}

func TestValidateDarwinLayoutAcceptsLegacyBundle(t *testing.T) {
	root := t.TempDir()
	bundle := filepath.Join(root, legacyAppBundleName)
	macos := filepath.Join(bundle, "Contents", "MacOS")
	if err := os.MkdirAll(filepath.Join(macos, cliDirName), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(macos, "Huabu"), []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(macos, cliDirName, darwinCLIName), []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := writeAgentLayout(filepath.Join(bundle, "Contents", "Resources", "agent-host"), "runtime/bin/node", "legacy"); err != nil {
		t.Fatal(err)
	}
	if err := validateDarwinLayout(root); err != nil {
		t.Fatalf("legacy bundle rejected: %v", err)
	}
}

// 双击运行名与包目录名必须成套识别，混着新目录旧可执行文件不算合法安装。
func TestMatchesAnyBaseCoversBothNames(t *testing.T) {
	if !matchesAnyBase(appBundleName, appBundleName, legacyAppBundleName) {
		t.Fatal("fresh name rejected")
	}
	if !matchesAnyBase(legacyAppBundleName, appBundleName, legacyAppBundleName) {
		t.Fatal("legacy name rejected while compatibility is enabled")
	}
	if matchesAnyBase("Other.app", appBundleName, legacyAppBundleName) {
		t.Fatal("unrelated name accepted")
	}
}

func TestMatchesWindowsExeNameUsesFilesystemCaseRules(t *testing.T) {
	for _, name := range []string{"BOBO.EXE", "HUABU.EXE"} {
		if !matchesWindowsExeName(name) {
			t.Fatalf("Windows executable name %q was rejected", name)
		}
	}
	if matchesWindowsExeName("other.exe") {
		t.Fatal("unrelated executable name was accepted")
	}
}

func TestPickExistingFileFallsBackToLegacy(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "Huabu"), []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	got := pickExistingFile(dir, darwinExeName, "Huabu")
	if filepath.Base(got) != "Huabu" {
		t.Fatalf("picked %q, want the legacy executable", got)
	}
}

// 两个名字都不存在时返回新名，让启动失败暴露真实原因而不是被静默吞掉。
func TestPickExistingFileReturnsFreshNameWhenNeitherExists(t *testing.T) {
	got := pickExistingFile(t.TempDir(), darwinExeName, "Huabu")
	if filepath.Base(got) != darwinExeName {
		t.Fatalf("picked %q, want %q", got, darwinExeName)
	}
}
