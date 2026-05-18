package com.mycompany.sparkmonitor.service;

import com.mycompany.sparkmonitor.dto.SparkMetricDTO;
import com.mycompany.sparkmonitor.repository.SparkMetricRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Optional;

@ApplicationScoped
public class SparkMetricService {

    @Inject SparkMetricRepository repository;

    public List<SparkMetricDTO> findAll(int page, int size, String sort, String order) {
        return repository.findAll(page, size, sort, order)
            .stream().map(SparkMetricDTO::from).toList();
    }

    public long count() { return repository.count(); }

    public Optional<SparkMetricDTO> findById(Long id) {
        return repository.findById(id).map(SparkMetricDTO::from);
    }

    public List<SparkMetricDTO> findByExecutionId(Long executionId, int page, int size) {
        return repository.findByExecutionId(executionId, page, size)
            .stream().map(SparkMetricDTO::from).toList();
    }

    public SparkMetricDTO create(SparkMetricDTO dto) {
        return SparkMetricDTO.from(repository.create(dto.toEntity()));
    }

    public Optional<SparkMetricDTO> update(Long id, SparkMetricDTO dto) {
        return repository.update(id, dto.toEntity()).map(SparkMetricDTO::from);
    }

    public boolean delete(Long id) { return repository.delete(id); }
}
