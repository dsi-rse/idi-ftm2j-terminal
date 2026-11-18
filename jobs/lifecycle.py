# VENDORED -- do not edit by hand.
#
# A verbatim copy of `src/cdt_dashboard_publisher/lifecycle.py` from the CDT
# dashboard (commercial-debt-tracker-website, branch `dev`, file last changed in
# ff5b51e). It is copied rather than reimplemented so the terminal and the CDT
# website cannot disagree about whether an instrument is still alive: the same
# inputs give the same status. To update, copy the file again and change the
# commit above; adapt the inputs in `debt.py` (`_lifecycle_records`), never this
# file.
"""Lifecycle status for the dashboard, using the vocabulary of CDT #183.

CDT stopped publishing a status (#197) because answering "is this borrowing
still alive" needs a notion of now, which would make its own output
non-reproducible. The dashboard has one: the date the publisher builds the
snapshot. This module is a port of the cascade CDT removed
(`derive_instrument_status` in `src/cdt/matcher/core.py` before 974ab16), read
off the published contract columns instead of CDT's prepared mentions.

Five answers. `active` and `closed` are what the filings confirm;
`expected_active` and `expected_closed` are read off a date that has passed
with nothing recorded against it; `announced` is an instrument that has not
started yet. `closed` always names its cause in the subtype. An instrument
with nothing dated and no decisive event has no status (`None`), which the
dashboard shows as "Unknown"; CDT's cascade called it `active`. An
announcement that nothing has followed for more than 30 days, with the
expected end still ahead, reads `active` with the subtype `likely`; once
every end date has passed it reads `expected_closed`, which CDT ranked below
the announcement. A retirement pointer closes an instrument unless a dated
planned retirement is still ahead or the retiring instrument itself reads
`announced`; CDT also let an undated plan, or a retiring instrument that was
announced and not started by its own test, hold it open.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
import json
from typing import Any

STATUS_VALUES = ("announced", "active", "expected_active", "closed", "expected_closed")
TERMINAL_STATUS_EVENTS = frozenset({"terminated", "repaid", "exchanged", "defaulted"})
CLOSED_STATUS_SUBTYPES = TERMINAL_STATUS_EVENTS | {"superseded"}
# How long after an announcement with nothing recorded since an instrument
# reads `active - likely`: offerings usually settle within two weeks.
LIKELY_ACTIVE_AFTER = timedelta(days=30)
# Expected date kinds that plan an end rather than a start.
EXPECTED_RETIREMENT_KINDS = frozenset({"retirement", "termination", "exchange", "default"})


@dataclass(frozen=True)
class InstrumentStatus:
    status: str | None
    subtype: str | None
    date: str | None
    source_mention_id: str | None


@dataclass(frozen=True)
class RetirementExpectation:
    """The dates of retirements the filings plan but never record as having happened."""

    dates: tuple[str, ...] = ()

    def dated_ahead_of(self, reference_date: str) -> bool:
        """Whether a planned retirement is dated after `reference_date`.

        Unlike CDT, an undated plan does not count: it is usually the plan the
        retirement pointer itself records ("proceeds will repay X"), so letting
        it hold the instrument open would keep the pointer from ever closing it.
        """
        return any(date > reference_date for date in self.dates)


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _date_facts(mention: dict[str, Any]) -> list[dict[str, Any]]:
    value = mention.get("dates_json")
    if isinstance(value, list):
        return [fact for fact in value if isinstance(fact, dict)]
    if not isinstance(value, str) or not value.strip():
        return []
    try:
        facts = json.loads(value)
    except json.JSONDecodeError:
        return []
    return [fact for fact in facts or [] if isinstance(fact, dict)]


def recency_key(mention: dict[str, Any]) -> tuple[str, str, str, str]:
    return (
        str(mention.get("date") or ""),
        str(mention.get("accession_number") or ""),
        str(mention.get("item_id") or ""),
        str(mention.get("debt_instrument_mention_id") or ""),
    )


def planned_retirement_date(mention: dict[str, Any]) -> str | None:
    """The date of a terminal event the mention notices but that has not happened.

    A terminal status dated after the filing that carries it is a notice (a
    redemption call, a use-of-proceeds target), so it plans an end rather than
    recording one.
    """
    status_date = _text(mention.get("status_date"))
    filed = _text(mention.get("date"))
    if mention.get("status") in TERMINAL_STATUS_EVENTS and status_date and filed and status_date > filed:
        return status_date
    return None


def expected_start(mentions: list[dict[str, Any]]) -> str | None:
    """The planned start (an expected closing) of the newest mention stating one."""
    for mention in sorted(mentions, key=recency_key, reverse=True):
        dates = [
            str(fact["normalized_date"])
            for fact in _date_facts(mention)
            if fact.get("expected") is True
            and fact.get("kind") == "closing"
            and not fact.get("prior")
            and _text(fact.get("normalized_date"))
        ]
        if dates:
            return min(dates)
    return None


def retirement_expectation(mentions: list[dict[str, Any]]) -> RetirementExpectation:
    """Every dated retirement the mentions plan."""
    dates: set[str] = set()
    for mention in mentions:
        for fact in _date_facts(mention):
            if fact.get("expected") is not True or fact.get("kind") not in EXPECTED_RETIREMENT_KINDS:
                continue
            normalized = _text(fact.get("normalized_date"))
            if normalized:
                dates.add(normalized)
        planned = planned_retirement_date(mention)
        if planned:
            dates.add(planned)
    return RetirementExpectation(dates=tuple(sorted(dates)))


def decisive_event(mentions: list[dict[str, Any]]) -> tuple[str, str | None, str] | None:
    """The newest extracted event that decides a status: (event, date, mention id).

    `entered_into` and `amended` say the instrument existed, not how it ended,
    so the newest such mention stops the scan and the date legs answer. A
    noticed terminal event is a planned date, not a decision. An announcement
    is dated no later than the filing that announced it.
    """
    for mention in sorted(mentions, key=recency_key, reverse=True):
        status = mention.get("status")
        if not status:
            continue
        mention_id = str(mention["debt_instrument_mention_id"])
        filed = _text(mention.get("date"))
        status_date = _text(mention.get("status_date")) or filed
        if status in TERMINAL_STATUS_EVENTS:
            if planned_retirement_date(mention):
                continue
            return str(status), status_date, mention_id
        if status == "announced":
            if status_date and filed and status_date > filed:
                status_date = filed
            return "announced", status_date, mention_id
        break
    return None


def retired_by_ids(instrument: dict[str, Any]) -> list[str]:
    value = instrument.get("retired_by_debt_instrument_ids")
    if isinstance(value, list):
        return [str(item) for item in value]
    text = _text(value)
    if not text:
        return []
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return []
    return [str(item) for item in parsed or []]


def derive_status(
    instrument: dict[str, Any],
    mentions: list[dict[str, Any]],
    *,
    reference_date: str,
    unstarted_announced_ids: set[str],
) -> InstrumentStatus:
    """The status of one instrument as of `reference_date` (YYYY-MM-DD)."""
    event = decisive_event(mentions)
    if event is not None and event[0] in TERMINAL_STATUS_EVENTS:
        return InstrumentStatus("closed", event[0], event[1], event[2])
    # Any amendment child makes this row a superseded state, including the
    # ambiguous two-child case where CDT publishes no superseded_by pointer.
    if instrument.get("superseded_by_debt_instrument_id") or instrument.get("is_lineage_head") is False:
        return InstrumentStatus("closed", "superseded", None, None)
    expectation = retirement_expectation(mentions)
    retiring = retired_by_ids(instrument)
    # A retirement pointer closes the instrument unless a dated retirement is
    # still ahead or the instrument that retires it has not started either (a
    # financing that has not closed).
    if retiring and not expectation.dated_ahead_of(reference_date) and not any(
        retiring_id in unstarted_announced_ids for retiring_id in retiring
    ):
        return InstrumentStatus("closed", "repaid", None, None)
    # The latest possible end governs: a lapsed commitment does not close a
    # facility whose principal is still owed to a later maturity.
    terminal_dates = sorted(
        {
            date
            for date in (
                _text(instrument.get("maturity_date")),
                _text(instrument.get("commitment_termination_date")),
                *expectation.dates,
            )
            if date
        }
    )
    # Dated plans are among the terminal dates already. Unlike CDT, an undated
    # plan does not hold an instrument open past its maturity: it has ended
    # either way, by the planned retirement or by running its term.
    past_every_end = bool(terminal_dates) and terminal_dates[-1] < reference_date
    start = _text(instrument.get("start_date"))
    if start and start <= reference_date:
        # An observed start outranks a later announcement (CDT #169).
        if past_every_end:
            return InstrumentStatus("expected_closed", None, terminal_dates[-1], None)
        return InstrumentStatus("active", None, start, None)
    planned_start = expected_start(mentions)
    if planned_start and planned_start <= reference_date:
        return InstrumentStatus("expected_active", None, planned_start, None)
    if past_every_end:
        # Unlike CDT's cascade, a passed end outranks an announcement: an
        # announced instrument nothing followed has most likely run its term.
        return InstrumentStatus("expected_closed", None, terminal_dates[-1], None)
    if event is not None and event[0] == "announced":
        # Nothing recorded since an announcement well in the past, and the
        # instrument has not reached its expected end: it most likely started.
        announced_on = event[1]
        if (
            announced_on
            and terminal_dates
            and reference_date < terminal_dates[-1]
            and date.fromisoformat(announced_on) + LIKELY_ACTIVE_AFTER < date.fromisoformat(reference_date)
        ):
            return InstrumentStatus("active", "likely", announced_on, event[2])
        return InstrumentStatus("announced", None, announced_on, event[2])
    if start:
        # A start still ahead, with no announcement event to date the status from.
        return InstrumentStatus("announced", None, start, None)
    # Nothing dated and no event. CDT read this as `active` (the filing treats
    # the obligation as outstanding), but nothing confirms it, so the
    # dashboard leaves it unknown.
    return InstrumentStatus(None, None, None, None)


def derive_statuses(
    instruments: list[dict[str, Any]],
    mentions_by_instrument: dict[str, list[dict[str, Any]]],
    *,
    reference_date: str,
) -> dict[str, InstrumentStatus]:
    """Every instrument's status, keyed by id.

    A first pass finds the instruments that read `announced`, so a retirement
    by an instrument that has not started yet does not close the one it will
    retire. Using the first pass's own answer, rather than CDT's "announced and
    not started" test, keeps an instrument that reads `active - likely` or
    `expected_closed` from blocking the one it retires.
    """

    def statuses(unstarted_announced_ids: set[str]) -> dict[str, InstrumentStatus]:
        return {
            str(instrument["debt_instrument_id"]): derive_status(
                instrument,
                mentions_by_instrument.get(str(instrument["debt_instrument_id"]), []),
                reference_date=reference_date,
                unstarted_announced_ids=unstarted_announced_ids,
            )
            for instrument in instruments
        }

    unstarted_announced_ids = {
        instrument_id for instrument_id, status in statuses(set()).items() if status.status == "announced"
    }
    return statuses(unstarted_announced_ids)
