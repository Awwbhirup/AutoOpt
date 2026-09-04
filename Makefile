.PHONY: help install lint fmt type test corpus experiment analyze figures report reproduce clean

help:
	@echo "install     install the engine with dev dependencies"
	@echo "lint        ruff check"
	@echo "fmt         ruff format"
	@echo "type        mypy --strict"
	@echo "test        pytest (excludes slow + llm markers)"
	@echo "corpus      generate the 500-program dataset"
	@echo "experiment  run every method x category cell -> master CSV"
	@echo "analyze     statistics: ANOVA, regression, distribution fits, reliability"
	@echo "figures     the six required plots + statistics plots"
	@echo "report      per-program decision logs + summary HTML"
	@echo "reproduce   corpus -> experiment -> analyze -> figures -> report, from scratch"

install:
	cd engine && pip install -e ".[dev]"

lint:
	cd engine && ruff check .

fmt:
	cd engine && ruff format .

type:
	cd engine && mypy autoopt

test:
	cd engine && pytest -m "not slow and not llm"

corpus:
	cd engine && python -m autoopt.cli corpus --out ../data/corpus

experiment:
	cd engine && python -m autoopt.cli experiment --corpus ../data/corpus --out ../data/runs

analyze:
	cd engine && python -m autoopt.cli analyze --runs ../data/runs

figures:
	cd engine && python -m autoopt.cli figures --runs ../data/runs

report:
	cd engine && python -m autoopt.cli report --runs ../data/runs

# Every number and figure in both subject reports, regenerated from nothing.
# Seeded throughout, so output is byte-identical across machines.
reproduce: corpus experiment analyze figures report
	@echo "Done. Figures and reports are under reports/generated/."

clean:
	rm -rf data/corpus/* data/runs/* reports/generated figures/generated
	find . -type d -name __pycache__ -exec rm -rf {} +
