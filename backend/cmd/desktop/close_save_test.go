package main

import "testing"

func TestCloseSaveWaitsForCurrentAcknowledgement(t *testing.T) {
	state := &desktopCloseSaveState{ready: true}
	first, prevent := state.begin()
	if !prevent || first == nil {
		t.Fatal("native close must wait for saving")
	}
	if duplicate, blocked := state.begin(); !blocked || duplicate != nil {
		t.Fatal("duplicate close started a concurrent save")
	}
	if err := state.complete("stale", true); err == nil {
		t.Fatal("stale acknowledgement accepted")
	}
	if err := state.complete(first.id, true); err != nil {
		t.Fatal(err)
	}
	if !<-first.result {
		t.Fatal("save was not acknowledged")
	}
	if err := state.complete(first.id, true); err == nil {
		t.Fatal("duplicate acknowledgement accepted")
	}
	state.finish(first, true)
	if _, blocked := state.begin(); blocked {
		t.Fatal("confirmed close still blocked")
	}
}

func TestCloseSaveFailureAndTimeoutRemainRetryable(t *testing.T) {
	for _, timeout := range []bool{false, true} {
		state := &desktopCloseSaveState{ready: true}
		first, _ := state.begin()
		if !timeout {
			if err := state.complete(first.id, false); err != nil {
				t.Fatal(err)
			}
			if <-first.result {
				t.Fatal("failed save reported success")
			}
		} else {
			first.responded = true
		}
		state.finish(first, false)
		second, prevent := state.begin()
		if !prevent || second == nil || second.id == first.id {
			t.Fatal("retry did not get a fresh request")
		}
		if err := state.complete(first.id, true); err == nil {
			t.Fatal("late success authorized retry")
		}
		state.finish(first, true)
		if state.approved {
			t.Fatal("stale attempt approved close")
		}
	}
}

func TestCloseBeforeFrontendReadyCanExit(t *testing.T) {
	state := &desktopCloseSaveState{}
	if attempt, blocked := state.begin(); blocked || attempt != nil {
		t.Fatal("uninitialized editor blocked startup exit")
	}
}
