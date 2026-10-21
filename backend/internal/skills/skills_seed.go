package skills

// EnsureBuiltinSkills is kept for older startup wiring. Huabu no longer seeds
// the legacy BeefTV public showcase; local and user-installed skills remain
// stored independently.
func (s *Service) EnsureBuiltinSkills() error {
	return nil
}
