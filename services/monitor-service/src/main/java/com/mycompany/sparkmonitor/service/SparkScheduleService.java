package com.mycompany.sparkmonitor.service;

import com.mycompany.sparkmonitor.dto.SparkScheduleDTO;
import com.mycompany.sparkmonitor.repository.SparkScheduleRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Optional;

@ApplicationScoped
public class SparkScheduleService {

    @Inject SparkScheduleRepository repository;

    public List<SparkScheduleDTO> findAll(int page, int size, String sort, String order) {
        return repository.findAll(page, size, sort, order)
            .stream().map(SparkScheduleDTO::from).toList();
    }

    public long count() { return repository.count(); }

    public Optional<SparkScheduleDTO> findById(Long id) {
        return repository.findById(id).map(SparkScheduleDTO::from);
    }

    public SparkScheduleDTO create(SparkScheduleDTO dto) {
        return SparkScheduleDTO.from(repository.create(dto.toEntity()));
    }

    public Optional<SparkScheduleDTO> update(Long id, SparkScheduleDTO dto) {
        return repository.update(id, dto.toEntity()).map(SparkScheduleDTO::from);
    }

    public boolean delete(Long id) { return repository.delete(id); }

    public List<SparkScheduleDTO> search(String q, int page, int size) {
        return repository.search(q, page, size)
            .stream().map(SparkScheduleDTO::from).toList();
    }
}
