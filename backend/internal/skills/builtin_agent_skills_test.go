package skills

import (
	"strings"
	"testing"

	"huabu/backend/internal/model"
)

func TestBoboBuiltinAgentSkillsArePrivateAndLoadable(t *testing.T) {
	svc, db := agentSkillFixture(t)
	userID := "workspace-user"

	added, err := svc.AddedSkills(userID)
	if err != nil {
		t.Fatal(err)
	}
	if len(added) != 3 {
		t.Fatalf("Agent picker returned %d skills, want 3", len(added))
	}
	for _, item := range added {
		if item.SourceType != "bobo_builtin" || !item.IsAdded || item.Status != skillStatusEnabled {
			t.Fatalf("unexpected built-in skill metadata: %#v", item)
		}
	}

	public, err := svc.Skills(userID, SkillListRequest{Scope: "public"})
	if err != nil {
		t.Fatal(err)
	}
	if len(public.Skills) != 0 {
		t.Fatalf("built-in Agent skills leaked into the public plaza: %#v", public.Skills)
	}
	var stored int64
	if err := db.Model(&model.Skill{}).Count(&stored).Error; err != nil {
		t.Fatal(err)
	}
	if stored != 0 {
		t.Fatalf("built-in Agent skills were written to the legacy skill database: %d", stored)
	}

	catalog, err := svc.AgentCatalog(userID)
	if err != nil {
		t.Fatal(err)
	}
	if len(catalog) != 3 {
		t.Fatalf("Agent catalog returned %d skills, want 3", len(catalog))
	}
	for _, item := range catalog {
		resource, err := svc.AgentVersion(userID, item.Pin)
		if err != nil {
			t.Fatalf("load %s: %v", item.Name, err)
		}
		if resource.Name != item.Name || resource.Version == "" || resource.Instruction == "" {
			t.Fatalf("incomplete Agent skill resource: %#v", resource)
		}
		if len(resource.Files) != 1 || resource.Files[0].Path != "SKILL.md" {
			t.Fatalf("unexpected built-in skill files: %#v", resource.Files)
		}
		file, err := svc.AgentFile(userID, item.Pin, "SKILL.md")
		if err != nil || file.Content != resource.Instruction || file.ExecutionSupported {
			t.Fatalf("built-in skill file = %#v, err = %v", file, err)
		}
		if _, err := svc.ValidateAgentSkills(userID, []Pin{item.Pin}); err != nil {
			t.Fatalf("validate %s: %v", item.Name, err)
		}
	}
}

func TestBoboBuiltinAgentSkillRejectsStaleAndUnlistedPins(t *testing.T) {
	svc, _ := agentSkillFixture(t)
	catalog, err := svc.AgentCatalog("workspace-user")
	if err != nil || len(catalog) == 0 {
		t.Fatalf("Agent catalog = %#v, err = %v", catalog, err)
	}

	stale := catalog[0].Pin
	stale.ContentHash = strings.Repeat("f", 64)
	if _, err := svc.AgentVersion("workspace-user", stale); err == nil {
		t.Fatal("stale built-in skill pin was accepted")
	}
	if _, err := svc.AgentFile("workspace-user", catalog[0].Pin, "references/private.md"); err == nil {
		t.Fatal("unlisted built-in skill file was readable")
	}
}
