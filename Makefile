.PHONY: help install lint fmt type test serve app llm-pass llm-status corpus experiment budgeted merge mutants analyze figures report notebook reproduce clean

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
	@echo "corpus      generate the 500-program dataset"
	@echo "experiment  run every method x category cell -> master CSV"
	@echo "budgeted    the same grid at three search budgets, for the statistics"
	@echo "merge       combine the run CSVs, refusing an uneven grid"
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

corpus:
	cd engine && python -m autoopt.cli corpus --out ../data/corpus

# Unconstrained. Answers what the system achieves, which is what the compiler
# report quotes.
experiment:
	cd engine && python -m autoopt.cli experiment --out ../data/runs/master.csv

# The same grid with the search capped, so methods are compared at equal effort.
# Without the cap the plateau-crossing methods all reach the same result and
# method stops being a usable factor.
budgeted:
	cd engine && python -m autoopt.cli experiment --out ../data/runs/budgeted.csv --budgets 6,10,16

# The LLM pass runs into its own file, so a run that dies partway cannot corrupt
# the grid the figures are built from. Merging is where coverage is checked.
merge:
	cd engine && python -m autoopt.cli merge ../data/runs/master.csv ../data/runs/llm.csv --out ../data/runs/complete.csv

mutants:
	cd engine && python -m autoopt.cli mutants --out ../data/verification/mutation_study.json

analyze:
	cd engine && python -m autoopt.cli analyze --data ../data/runs/budgeted.csv --budget 10

figures:
	cd engine && python -m autoopt.cli figures --data ../data/runs/master.csv

report:
	cd engine && python -m autoopt.cli report --data ../data/runs/master.csv

notebook:
	cd notebooks && python -m jupyter nbconvert --to notebook --execute --inplace analysis.ipynb

# Every number and figure in both subject reports, regenerated from nothing.
# Seeded throughout, so output is byte-identical across machines.
reproduce: corpus experiment budgeted mutants analyze figures report notebook
	@echo "Done. Figures and reports are under reports/generated/."

clean:
	rm -rf data/corpus/* data/runs/* data/verification/* reports/generated figures/generated
	find . -type d -name __pycache__ -exec rm -rf {} +
