.PHONY: help install lint fmt type test serve app llm-pass llm-status llm-watch llm-grid corpus experiment budgeted merge mutants analyze figures report notebook reproduce clean

# reproduce is a pipeline, not a set: merge needs the llm pass finished, and
# analyze reads the mutation study off disk and quietly drops the M7 detection
# numbers when it is not there yet. -j would let those race.
.NOTPARALLEL:

# The llm arms are levels of the method factor like any other, so "all" would
# pull them into the offline grid and put the run behind a daily token quota.
# They get their own pass and are merged in afterwards.
RULES = fixed_pipeline,greedy,random_baseline,astar,hill_climbing,simulated_annealing

help:
	@echo "install     install the engine with dev dependencies"
	@echo "lint        ruff check"
	@echo "fmt         ruff format"
	@echo "type        mypy --strict"
	@echo "test        pytest (excludes slow + llm markers)"
	@echo "serve       run the compute service on :8000"
	@echo "app         run the application tier on :3000"
	@echo "llm-pass    keep the llm pass going until the corpus is complete"
	@echo "llm-status  how far the llm pass has got"
	@echo "llm-watch   live view of the pass while it runs"
	@echo "llm-grid    the llm arm at the three node budgets, one cell at a time"
	@echo "corpus      generate the 500-program dataset"
	@echo "experiment  run the rule-based method x category cells -> master CSV"
	@echo "budgeted    the same grid at three search budgets, for the M6 sweep"
	@echo "merge       fold the llm pass into the rule grid -> complete CSV"
	@echo "mutants     inject faults, measure what each verification channel catches"
	@echo "analyze     statistics: ANOVA, regression, distribution fits, reliability"
	@echo "figures     the six required plots + statistics plots"
	@echo "report      per-program decision logs + summary HTML"
	@echo "notebook    execute the reproduction notebook in place"
	@echo "reproduce   everything above, from nothing"

install:
	cd engine && pip install -e ".[dev,notebook]"
	cd service && pip install -e ".[dev]"
	cd web && npm install

lint:
	cd engine && ruff check .
	cd service && ruff check .
	cd web && npm run lint

fmt:
	cd engine && ruff format .
	cd service && ruff format .

type:
	cd engine && mypy autoopt
	cd service && mypy autoopt_service
	cd web && npm run typecheck

test:
	cd engine && pytest -m "not slow and not llm"
	cd service && pytest
	cd web && npm test

# Reload on edit. The engine is imported as a library, so a change there is
# picked up the same way a change here is.
serve:
	cd service && uvicorn autoopt_service.app:app --reload --port 8000

app:
	cd web && npm run dev

# Survives the daily quota running out. --install makes it start at logon.
llm-pass:
	python scripts/llm_pass.py

llm-status:
	python scripts/llm_pass.py --status

llm-watch:
	python scripts/llm_watch.py

# The cells budgeted skips. One budget at a time, waiting for the keys, because
# every cell draws on the same daily token budget.
llm-grid:
	python scripts/llm_grid.py

corpus:
	cd engine && python -m autoopt.cli corpus --out ../data/corpus

# Unconstrained. Answers what the system achieves, which is what the compiler
# report quotes, though it quotes it from the merged CSV rather than this one.
experiment:
	cd engine && python -m autoopt.cli experiment --out ../data/runs/master.csv --methods $(RULES)

# The same grid with the search capped, so methods are compared at equal effort.
# Without the cap the three plateau-crossing methods land on the same program
# every time and nothing can tell them apart. Rule-based only here: the llm arm
# is capped the same way, but by scripts/llm_grid.py, which has to work around a
# daily token budget this target knows nothing about.
budgeted:
	cd engine && python -m autoopt.cli experiment --out ../data/runs/budgeted.csv --methods $(RULES) --budgets 6,10,16

# The LLM pass runs into its own file, so a run that dies partway cannot corrupt
# the grid the figures are built from. Merging is where coverage is checked.
merge:
	cd engine && python -m autoopt.cli merge ../data/runs/master.csv ../data/runs/llm.csv --out ../data/runs/complete.csv

mutants:
	cd engine && python -m autoopt.cli mutants --out ../data/verification/mutation_study.json

# On the merged grid, like the figures and the report: one dataset behind every
# number in both submissions. The budget sweep answers a narrower question and
# is analysed in the notebook's M6 instead.
analyze:
	cd engine && python -m autoopt.cli analyze --data ../data/runs/complete.csv

figures:
	cd engine && python -m autoopt.cli figures --data ../data/runs/complete.csv

report:
	cd engine && python -m autoopt.cli report --data ../data/runs/complete.csv

notebook:
	cd notebooks && python -m jupyter nbconvert --to notebook --execute --inplace analysis.ipynb

# Every number and figure in both subject reports, regenerated from nothing.
# Seeded throughout, so output is byte-identical across machines. The llm pass
# is the slow part: on a cold cache it waits out the daily token quota, so this
# is a multi-day target rather than an afternoon one.
reproduce: corpus experiment llm-pass merge budgeted mutants analyze figures report notebook
	@echo "Done. Figures and reports are under reports/generated/."

clean:
	rm -rf data/corpus/* data/runs/* data/verification/* reports/generated figures/generated
	find . -type d -name __pycache__ -exec rm -rf {} +
