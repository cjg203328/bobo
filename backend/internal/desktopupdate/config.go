package desktopupdate

import (
	"crypto/ed25519"
	"encoding/base64"
	"net/url"
	"runtime"
	"strings"
)

// Link-time variables. Release builds inject an HTTPS feed and a base64 raw
// 32-byte Ed25519 public key. Both empty disables the updater.
var (
	FeedURL   = ""
	PublicKey = ""
)

// 应用包名正在从 Huabu 迁到 Bobo。过渡版本必须同时认识两套名字：
// 旧安装要能被新包替换，新安装要能被旧签名清单以外的路径复用，
// 否则一次改名的代价是所有存量客户端再也收不到更新。
const (
	appBundleName       = "Bobo.app"
	linuxBundleName     = "Bobo-linux"
	windowsExeName      = "Bobo.exe"
	legacyAppBundleName = "Huabu.app"
	legacyLinuxBundle   = "Huabu-linux"
	legacyWindowsExe    = "Huabu.exe"
	// macOS 与 Linux 包内可执行文件名随包名一起迁移。
	darwinExeName = "Bobo"
	linuxExeName  = "Bobo"
)

// legacyNamesAccepted 控制过渡期的双名识别。发布一轮之后把它翻成 false，
// 双名逻辑即可整体退场，不必再逐处删除判断。
const legacyNamesAccepted = true

const (
	helperFlag    = "--huabu-update-helper"
	pluginDirName = "plugin-packages"
	// 随包 CLI：外部 Agent 的接入入口，升级包里必须带上，否则升级一次就断了接入。
	// 它必须待在自己的 cli 目录里：macOS 与 Windows 的文件名都不分大小写，
	// huabu 直接放在主程序旁边会和 Huabu / Huabu.exe 撞成同一个文件。
	cliDirName      = "cli"
	darwinCLIName   = "huabu"
	windowsCLIName  = "huabu.exe"
	pluginExtension = ".beeftv-plugin"
	payloadSchema   = 1
	maxFeedBytes    = 1 << 20
	maxRedirects    = 8
	maxZipFiles     = 50000
	maxZipEntry     = 1 << 30
	maxZipTotal     = 2 << 30
)

func ParsePublicKey(value string) (ed25519.PublicKey, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, ErrIncompleteConfig
	}
	raw, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return nil, ErrIncompleteConfig
	}
	if len(raw) != ed25519.PublicKeySize {
		return nil, ErrIncompleteConfig
	}
	return ed25519.PublicKey(raw), nil
}

func CurrentPlatform() (string, error) {
	switch runtime.GOOS + "-" + runtime.GOARCH {
	case "darwin-arm64":
		return "darwin-arm64", nil
	case "darwin-amd64":
		return "darwin-amd64", nil
	case "windows-amd64":
		return "windows-amd64", nil
	case "linux-amd64":
		return "linux-amd64", nil
	default:
		return "", ErrUnsupported
	}
}

func normalizeFeedURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", ErrIncompleteConfig
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return "", ErrIncompleteConfig
	}
	return parsed.String(), nil
}

func configFromVars() (feed string, key ed25519.PublicKey, enabled bool, reason string) {
	feedRaw := strings.TrimSpace(FeedURL)
	keyRaw := strings.TrimSpace(PublicKey)
	if feedRaw == "" && keyRaw == "" {
		return "", nil, false, ""
	}
	if feedRaw == "" || keyRaw == "" {
		return "", nil, false, ErrIncompleteConfig.Error()
	}
	feed, err := normalizeFeedURL(feedRaw)
	if err != nil {
		return "", nil, false, "更新地址无效。"
	}
	key, err = ParsePublicKey(keyRaw)
	if err != nil {
		return "", nil, false, "更新配置无效。"
	}
	return feed, key, true, ""
}
