package main

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const desktopCloseSaveEvent = "huabu:before-close-save"
const desktopCloseSaveTimeoutEvent = "huabu:close-save-timeout"

type desktopCloseSaveAttempt struct {
	id        string
	result    chan bool
	responded bool
}

// Only the current request can release the native close barrier. Timeouts and
// duplicate acknowledgements never authorize a later attempt to close.
type desktopCloseSaveState struct {
	mu       sync.Mutex
	ready    bool
	approved bool
	sequence uint64
	pending  *desktopCloseSaveAttempt
}

func (s *desktopCloseSaveState) begin() (*desktopCloseSaveAttempt, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.ready || s.approved {
		return nil, false
	}
	if s.pending != nil {
		return nil, true
	}
	s.sequence++
	attempt := &desktopCloseSaveAttempt{id: strconv.FormatUint(s.sequence, 10), result: make(chan bool, 1)}
	s.pending = attempt
	return attempt, true
}

func (s *desktopCloseSaveState) complete(id string, saved bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pending == nil || s.pending.id != id || s.pending.responded {
		return errors.New("关闭保存请求已结束")
	}
	s.pending.responded = true
	s.pending.result <- saved
	return nil
}

func (s *desktopCloseSaveState) finish(attempt *desktopCloseSaveAttempt, approved bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pending != attempt {
		return
	}
	s.pending = nil
	s.approved = approved
}

func (a *DesktopApp) CloseSaveReady() {
	a.closeSave.mu.Lock()
	defer a.closeSave.mu.Unlock()
	a.closeSave.ready = true
}

func (a *DesktopApp) CompleteCloseSave(requestID string, saved bool) error {
	return a.closeSave.complete(requestID, saved)
}

func (a *DesktopApp) beforeClose(ctx context.Context) bool {
	attempt, prevent := a.closeSave.begin()
	if attempt == nil {
		return prevent
	}
	go func() {
		wailsruntime.EventsEmit(ctx, desktopCloseSaveEvent, attempt.id)
		timer := time.NewTimer(30 * time.Second)
		defer timer.Stop()
		saved := false
		select {
		case saved = <-attempt.result:
		case <-timer.C:
			// Invalidate a late acknowledgement while the recovery dialog is open.
			a.closeSave.mu.Lock()
			attempt.responded = true
			a.closeSave.mu.Unlock()
			wailsruntime.EventsEmit(ctx, desktopCloseSaveTimeoutEvent, attempt.id)
		case <-ctx.Done():
			a.closeSave.finish(attempt, false)
			return
		}
		if !saved {
			answer, err := wailsruntime.MessageDialog(ctx, wailsruntime.MessageDialogOptions{
				Type:    wailsruntime.QuestionDialog,
				Title:   "画布尚未确认保存",
				Message: "保存未完成，是否返回画布继续处理？\n选择“是”保留窗口，可稍后再次关闭以重试保存。\n选择“否”直接退出，尚未保存的修改可能丢失。",
				Buttons: []string{"Yes", "No"}, DefaultButton: "Yes", CancelButton: "Yes",
			})
			saved = err == nil && answer == "No"
		}
		a.closeSave.finish(attempt, saved)
		if saved {
			wailsruntime.Quit(ctx)
		}
	}()
	return true
}
