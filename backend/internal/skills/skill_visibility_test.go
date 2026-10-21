package skills

import (
	"testing"

	"huabu/backend/internal/kernel"
	"huabu/backend/internal/model"
	"huabu/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newVisibilityTestService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+kernel.NewID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Skill{}, &model.SkillVersion{}, &model.SkillFile{}, &model.UserSkillState{}); err != nil {
		t.Fatal(err)
	}
	return New(repository.New(db), t.TempDir(), nil), db
}

func TestSetSkillVisibilityPublishesAndUnpublishes(t *testing.T) {
	svc, db := newVisibilityTestService(t)
	ownerID := kernel.NewID()
	viewerID := kernel.NewID()
	skill := model.Skill{ID: kernel.NewID(), OwnerID: ownerID, Name: "可见性技能", Description: "发布状态切换", Instruction: "# 可见性技能\n\n第一版", Status: skillStatusEnabled, Source: skillSourceUser, IsPrivate: true, ShowcaseMediaJSON: "[]"}
	if err := db.Create(&skill).Error; err != nil {
		t.Fatal(err)
	}

	countPublic := func(userID string) int {
		result, err := svc.Skills(userID, SkillListRequest{Scope: "public"})
		if err != nil {
			t.Fatal(err)
		}
		return len(result.Skills)
	}

	if got := countPublic(viewerID); got != 0 {
		t.Fatalf("private skill should stay hidden from the plaza, got %d", got)
	}

	published, err := svc.SetSkillVisibility(ownerID, skill.ID, false)
	if err != nil {
		t.Fatal(err)
	}
	if published.IsPrivate {
		t.Fatal("published skill should report IsPrivate=false")
	}
	if got := countPublic(viewerID); got != 1 {
		t.Fatalf("published skill should appear in the plaza, got %d", got)
	}

	// 幂等：重复发布不报错，状态保持公开。
	if _, err := svc.SetSkillVisibility(ownerID, skill.ID, false); err != nil {
		t.Fatal(err)
	}

	unpublished, err := svc.SetSkillVisibility(ownerID, skill.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	if !unpublished.IsPrivate {
		t.Fatal("unpublished skill should report IsPrivate=true")
	}
	if got := countPublic(viewerID); got != 0 {
		t.Fatalf("unpublished skill should leave the plaza, got %d", got)
	}

	// 作者本人在“我创建的”里始终可见，不受公开状态影响。
	created, err := svc.Skills(ownerID, SkillListRequest{Scope: "created"})
	if err != nil {
		t.Fatal(err)
	}
	if len(created.Skills) != 1 {
		t.Fatalf("owner should always see own skill in created scope, got %d", len(created.Skills))
	}
}

func TestSetSkillVisibilityRejectsNonOwner(t *testing.T) {
	svc, db := newVisibilityTestService(t)
	ownerID := kernel.NewID()
	strangerID := kernel.NewID()
	skill := model.Skill{ID: kernel.NewID(), OwnerID: ownerID, Name: "归属技能", Description: "仅作者可改", Instruction: "# 归属技能\n\n第一版", Status: skillStatusEnabled, Source: skillSourceUser, IsPrivate: true, ShowcaseMediaJSON: "[]"}
	if err := db.Create(&skill).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetSkillVisibility(strangerID, skill.ID, false); err == nil {
		t.Fatal("expected non-owner publish to be rejected")
	}
	// 被拒绝后状态不变。
	stored, err := svc.SkillDetail(ownerID, skill.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !stored.IsPrivate {
		t.Fatal("rejected publish must not change visibility")
	}
}

func TestLegacyShowcaseIsHiddenButInstalledSkillsRemainVisible(t *testing.T) {
	svc, db := newVisibilityTestService(t)
	viewerID := kernel.NewID()
	legacy := model.Skill{ID: kernel.NewID(), OwnerID: kernel.NewID(), Name: "旧展示技能", Status: skillStatusEnabled, Source: 3, ShowcaseMediaJSON: "[]"}
	custom := model.Skill{ID: kernel.NewID(), OwnerID: kernel.NewID(), Name: "Huabu 自建技能", Status: skillStatusEnabled, Source: skillSourceUser, ShowcaseMediaJSON: "[]"}
	if err := db.Create(&legacy).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&custom).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.UserSkillState{ID: kernel.NewID(), UserID: viewerID, SkillID: legacy.ID, Added: true, Liked: true}).Error; err != nil {
		t.Fatal(err)
	}

	public, err := svc.Skills(viewerID, SkillListRequest{Scope: "public"})
	if err != nil {
		t.Fatal(err)
	}
	if len(public.Skills) != 1 || public.Skills[0].SkillID != custom.ID {
		t.Fatalf("public catalog = %#v, want only the Huabu skill", public.Skills)
	}

	installed, err := svc.Skills(viewerID, SkillListRequest{Scope: "mine"})
	if err != nil {
		t.Fatal(err)
	}
	if len(installed.Skills) != 1 || installed.Skills[0].SkillID != legacy.ID {
		t.Fatalf("installed list = %#v, want the existing installed skill", installed.Skills)
	}

	favorites, err := svc.Skills(viewerID, SkillListRequest{Scope: "favorites"})
	if err != nil {
		t.Fatal(err)
	}
	if len(favorites.Skills) != 0 {
		t.Fatalf("favorites should not restore legacy showcase entries, got %#v", favorites.Skills)
	}
}

func TestEnsureBuiltinSkillsDoesNotSeedLegacyShowcase(t *testing.T) {
	svc, db := newVisibilityTestService(t)
	if err := svc.EnsureBuiltinSkills(); err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := db.Model(&model.Skill{}).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("legacy showcase seed created %d skill entries", count)
	}
}
