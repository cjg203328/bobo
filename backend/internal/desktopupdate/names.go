package desktopupdate

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// 过渡期包名探测：优先新名，回落旧名。
// 探测只看暂存目录里实际存在的条目，不猜当前正在运行的包名——
// 升级包的布局由打包脚本决定，与本地安装形态无关。
func detectDarwinBundleName(root string) (string, error) {
	for _, name := range []string{appBundleName, legacyAppBundleName} {
		if name == legacyAppBundleName && !legacyNamesAccepted {
			continue
		}
		info, err := os.Lstat(filepath.Join(root, name))
		if err == nil && info.IsDir() && info.Mode()&os.ModeSymlink == 0 {
			return name, nil
		}
	}
	return "", fmt.Errorf("更新包缺少应用包")
}

func detectLinuxBundleName(root string) (string, error) {
	for _, name := range []string{linuxBundleName, legacyLinuxBundle} {
		if name == legacyLinuxBundle && !legacyNamesAccepted {
			continue
		}
		info, err := os.Lstat(filepath.Join(root, name))
		if err == nil && info.IsDir() && info.Mode()&os.ModeSymlink == 0 {
			return name, nil
		}
	}
	return "", fmt.Errorf("更新包缺少应用目录")
}

func detectWindowsExeName(root string) (string, error) {
	for _, name := range []string{windowsExeName, legacyWindowsExe} {
		if name == legacyWindowsExe && !legacyNamesAccepted {
			continue
		}
		info, err := os.Lstat(filepath.Join(root, name))
		if err == nil && info.Mode().IsRegular() {
			return name, nil
		}
	}
	return "", fmt.Errorf("更新包缺少可执行文件")
}

// installedBundleName 判断目标安装目录里已有的是新包还是旧包。
// 安装目录里旧包可能仍叫 Huabu.app / Huabu-linux，替换时必须沿用实际名字，
// 否则会把旧目录留在原地、另起一个新名字的副本。
func installedBundleName(base string, fresh, legacy string) string {
	if _, err := os.Lstat(filepath.Join(base, fresh)); err == nil {
		return fresh
	}
	if legacyNamesAccepted {
		if _, err := os.Lstat(filepath.Join(base, legacy)); err == nil {
			return legacy
		}
	}
	return fresh
}

// matchesAnyBase 判断可执行文件 / 包目录名是否命中允许的名字。
// 最后一个候选是真正的旧名，仅在过渡期生效。
func matchesAnyBase(got string, fresh, legacy string) bool {
	if got == fresh {
		return true
	}
	if legacyNamesAccepted && got == legacy {
		return true
	}
	return false
}

func matchesWindowsExeName(got string) bool {
	return strings.EqualFold(got, windowsExeName) || (legacyNamesAccepted && strings.EqualFold(got, legacyWindowsExe))
}

// pickExistingFile 在目录里挑出实际存在的主程序：优先新名，过渡期回落旧名。
// 两者都不存在时返回新名，让调用方拿到真实的启动失败，而不是被这里吞掉。
func pickExistingFile(dir, fresh, legacy string) string {
	candidate := filepath.Join(dir, fresh)
	if _, err := os.Lstat(candidate); err == nil {
		return candidate
	}
	if legacyNamesAccepted {
		legacyPath := filepath.Join(dir, legacy)
		if _, err := os.Lstat(legacyPath); err == nil {
			return legacyPath
		}
	}
	return candidate
}
